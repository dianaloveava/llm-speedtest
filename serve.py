#!/usr/bin/env python3
"""LLM SpeedTest — zero-dependency local server.

Serves this folder over HTTP and opens the default browser, so the app runs
without any build step. Python standard library only.

    python serve.py                 # port 8000, opens the default browser
    python serve.py --port 8080     # first port to try
    python serve.py --no-open       # serve only, do not open a browser
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import http.server
import socket
import sys
import threading
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


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def end_headers(self) -> None:
        # The app is edited constantly; never let the browser cache it.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("  " + (fmt % args) + "\n")


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
    args = parser.parse_args()

    port = free_port(args.port, args.host)
    if port != args.port:
        print(f"  端口 {args.port} 已占用，改用 {port} / port {args.port} busy, using {port}")

    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer((args.host, port), handler) as httpd:
        url = f"http://{args.host}:{port}/"
        print(f"LLM SpeedTest  ->  {url}")
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
