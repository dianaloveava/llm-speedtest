#!/usr/bin/env python3
"""LLM SpeedTest — zero-dependency local server.

Serves this folder over HTTP and opens the default browser, so the app runs
without any build step. Python standard library only.

    python serve.py                        # port 8000, opens the default browser
    python serve.py --port 8080            # first port to try
    python serve.py --no-open              # serve only, do not open a browser
    python serve.py --proxy http://127.0.0.1:3425
                                           # also expose that upstream under /api,
                                           # same-origin, so browser CORS never applies

Why the proxy exists: a page can only call another origin when that origin sends
Access-Control-Allow-Origin and answers OPTIONS preflights. Plenty of local model
gateways do neither, which blocks the browser before the request is even sent.
Routing through this server makes the call same-origin, so no CORS is involved.
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import http.client
import http.server
import socket
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Explicit types: SimpleHTTPRequestHandler's mimetypes guess varies by platform
# and Python version (a stray text/plain for .js breaks strict setups).
EXTRA_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".md": "text/markdown; charset=utf-8",
}

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}

# Never forwarded upstream: browser metadata, and compression (we stream raw
# bytes through, so the upstream must not gzip or we would have to inflate).
SKIP_REQUEST_HEADERS = HOP_BY_HOP | {
    "host",
    "content-length",
    "accept-encoding",
    "origin",
    "referer",
    "cookie",
    "cache-control",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    # Set from main(); None disables the proxy entirely.
    proxy_base: str | None = None
    proxy_timeout: int = 600

    # ── plumbing ───────────────────────────────────────────────────────────
    def end_headers(self) -> None:
        # The app is edited constantly; never let the browser cache it.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("  " + (fmt % args) + "\n")

    def _proxy_path(self) -> str | None:
        """'/api/v1/models?x=1' → '/v1/models?x=1', else None."""
        if not Handler.proxy_base:
            return None
        if not (self.path == "/api" or self.path.startswith("/api/")):
            return None
        return self.path[len("/api"):] or "/"

    def _cors_headers(self) -> None:
        # Same-origin calls need none of this; it is here so the proxy also
        # works when the page is opened from file:// or another port.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "600")

    def _json_error(self, status: int, message: str) -> None:
        body = ('{"error":{"message":' + _json_string(message) + '}}').encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ── reverse proxy ──────────────────────────────────────────────────────
    def _forward(self, rest: str) -> None:
        upstream = urllib.parse.urlsplit(Handler.proxy_base)
        target = upstream.path.rstrip("/") + rest
        if not target.startswith("/"):
            target = "/" + target

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length > 0 else None

        headers = {
            k: v for k, v in self.headers.items()
            if k.lower() not in SKIP_REQUEST_HEADERS and not k.lower().startswith("sec-")
        }
        headers["Host"] = upstream.netloc
        headers["Accept-Encoding"] = "identity"

        conn_cls = http.client.HTTPSConnection if upstream.scheme == "https" else http.client.HTTPConnection
        try:
            conn = conn_cls(upstream.netloc, timeout=Handler.proxy_timeout)
            conn.request(self.command, target, body=body, headers=headers)
            response = conn.getresponse()
        except OSError as exc:
            self._json_error(502, f"Proxy cannot reach {Handler.proxy_base}: {exc}")
            return

        try:
            self.send_response(response.status)
            for name, value in response.getheaders():
                lname = name.lower()
                if lname in HOP_BY_HOP or lname in ("content-length", "cache-control"):
                    continue
                self.send_header(name, value)
            self._cors_headers()
            self.end_headers()

            # Stream chunk by chunk and flush: buffering here would destroy the
            # first-token latency this tool measures.
            while True:
                chunk = response.read1(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            with contextlib.suppress(Exception):
                response.close()
                conn.close()

    def _handle_proxy(self) -> bool:
        rest = self._proxy_path()
        if rest is None:
            return False
        if self.command == "OPTIONS":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self._cors_headers()
            self.end_headers()
            return True
        self._forward(rest)
        return True

    # ── HTTP verbs ─────────────────────────────────────────────────────────
    def do_GET(self) -> None:
        if self._handle_proxy():
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if self._handle_proxy():
            return
        super().do_HEAD()

    def do_POST(self) -> None:
        if self._handle_proxy():
            return
        self.send_error(501, "POST is only available under /api when --proxy is set")

    def do_PUT(self) -> None:
        if self._handle_proxy():
            return
        self.send_error(501, "Method not supported for static files")

    def do_DELETE(self) -> None:
        if self._handle_proxy():
            return
        self.send_error(501, "Method not supported for static files")

    def do_OPTIONS(self) -> None:
        if self._handle_proxy():
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Allow", "GET, HEAD, OPTIONS")
        self.end_headers()


def _json_string(value: str) -> str:
    out = value.replace("\\", "\\\\").replace('"', '\\"')
    return '"' + out.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + '"'


def free_port(start: int, host: str) -> int:
    """First port at or after `start` that can be bound."""
    for port in range(start, start + 20):
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as probe:
            try:
                probe.bind((host, port))
            except OSError:
                continue
            return port
    raise SystemExit(f"No free port in {start}..{start + 19}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve LLM SpeedTest locally and open the browser.")
    parser.add_argument("--port", type=int, default=8000, help="first port to try (default: 8000)")
    parser.add_argument("--host", default="127.0.0.1", help="interface to bind (default: 127.0.0.1)")
    parser.add_argument("--no-open", action="store_true", help="do not open the default browser")
    parser.add_argument("--proxy", metavar="URL",
                        help="expose this API base under /api (e.g. http://127.0.0.1:3425) "
                             "so browser CORS never applies")
    parser.add_argument("--proxy-timeout", type=int, default=600,
                        help="upstream socket timeout in seconds (default: 600)")
    args = parser.parse_args()

    if args.proxy:
        parsed = urllib.parse.urlsplit(args.proxy)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            parser.error("--proxy needs a full URL, e.g. http://127.0.0.1:3425")
        Handler.proxy_base = args.proxy.rstrip("/")
        Handler.proxy_timeout = args.proxy_timeout

    port = free_port(args.port, args.host)
    if port != args.port:
        print(f"  端口 {args.port} 已占用，改用 {port} / port {args.port} busy, using {port}")

    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer((args.host, port), handler) as httpd:
        url = f"http://{args.host}:{port}/"
        print(f"LLM SpeedTest  ->  {url}")
        if Handler.proxy_base:
            print(f"  反代 / proxy:  /api/**  ->  {Handler.proxy_base}")
            print(f"  Base URL 填 / use as Base URL:  {url}api")
        print("  Ctrl+C 停止服务 / press Ctrl+C to stop")
        if args.no_open:
            print("  --no-open: 请手动打开上面的地址 / open the URL above yourself")
        else:
            # Let the socket start listening before the browser arrives.
            threading.Timer(0.4, webbrowser.open, args=(url,)).start()
            print(f"  正在用默认浏览器打开 {url} / opening it in your default browser")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  已停止 / stopped")


if __name__ == "__main__":
    main()
