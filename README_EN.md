# LLM SpeedTest

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/stargazers)
[![GitHub license](https://img.shields.io/github/license/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/issues)

**Speedtest for LLM APIs — measure TTFT, throughput, tokens and cost across providers, right in your browser.**

**Docs language:** English | [中文](README.md) · **App UI defaults to Chinese** (switchable to English in the header).

</div>

## Overview

LLM SpeedTest is a zero-dependency, browser-based benchmark tool for Large Language Model APIs. Configure multiple API targets (different providers, protocols, or models), fire concurrent streaming requests at them, and compare them side by side on latency, throughput, token usage, and cost.

Everything runs locally in your browser: API keys are stored only in your browser's localStorage, requests go directly from your browser to the endpoints you configure, and there is no backend, no telemetry, and no relay.

## Features

### Protocol Support
- **OpenAI Chat Completions** (`/v1/chat/completions`) — also works with any OpenAI-compatible endpoint
- **OpenAI Responses** (`/v1/responses`)
- **Anthropic Messages** (`/v1/messages`)
- **Google Generative AI / Gemini** (`streamGenerateContent?alt=sse`)
- **Ollama Chat** (`/api/chat`) — test local models
- **Cohere Chat** (`/v2/chat`)
- Smart base-URL completion: type `http://host:8000` and the full path is completed for you
- One-click model list fetching where the protocol supports it

### Streaming & Real Usage Tokens
- True SSE streaming with per-token timestamps
- Real token usage is captured when providers report it (OpenAI `stream_options.include_usage`, Anthropic `message_delta.usage`, Gemini `usageMetadata`); falls back to estimation otherwise

### Metrics
- **TTFT** (time to first token): average / P50 / P90 / P95 / P99
- **Total latency** (TTLT): average
- **Output speed** (t/s): average / P50 / P90
- **TPOT** (ms per output token, excluding the first-token wait)
- **ITL** (inter-token latency): P90 / max
- **Input (prefill) speed** (t/s)
- Token counts, success rate, and error classification (rate limit 429 / auth 401·403 / bad request / timeout / server 5xx / network / cancelled)

### Cost Analysis
- Per-model price configuration (`model=input_price,output_price` in $/1M tokens, e.g. `gpt-4o=2.5,10`)
- Per-request and total cost, tokens per dollar

### Workflow
- Multiple targets, each with its own protocol / base URL / API key / models
- Concurrent requests and configurable test rounds
- Enable/disable targets with collapsible rows
- Live tab for the in-flight request; per-request detail dialog afterwards
- Test history (last 20 runs, stored locally) with model-level summary, per-record delete, re-run and export
- CSV / JSON export (per-request results and per-model statistics), plus configuration import/export
- 中文 / English interface, Chinese by default

## Quick Start

No install, no build, no dependencies.

**One command (starts the server and opens your default browser):**
```bash
# Python 3 — standard library only
python serve.py

# Windows can also just double-click start.bat
```
`serve.py` listens on port 8000, stepping to the next free port if it is taken; `--port 8080` picks a port, `--no-open` serves without opening a browser.

**Any static server works too (open the URL yourself):**
```bash
python -m http.server 8000
npx serve .
```

> The app itself only needs a modern browser.

**When a local endpoint refuses browser CORS:** a cross-origin response must carry `Access-Control-Allow-Origin` and survive an `OPTIONS` preflight; many local model gateways do neither (the preflight 404s), so the browser blocks the call before it is sent — no front-end can work around that. Put the endpoint behind the same-origin proxy instead:

```bash
python serve.py --proxy http://127.0.0.1:3425
```

Then set the target's **Base URL** to `http://127.0.0.1:8000/api` — the local server forwards the call, same origin, so no CORS check applies. SSE is streamed chunk by chunk, so first-token latency and speed stay accurate (measured: first chunk at 30 ms, nothing buffered).

### Desktop app (Tauri 2)

The same front-end also ships as a native window. The desktop build sends HTTP from Rust (reqwest), so **there is no browser same-origin policy** — no CORS, and no need for `--proxy`.

```bash
npm install     # installs only @tauri-apps/cli
npm run dev     # build dist/ and open the window
npm run build   # produce installers (Windows .msi/.exe, macOS .dmg, Linux .deb/.AppImage)
```

- The first build needs Rust (rustup + MSVC Build Tools) and WebView2 (bundled with Win11).
- The front-end is still the same handful of files; `dist/` is generated at build time and not committed — the desktop app is just a host for that page.
- Cross-platform: build on Windows / macOS / Linux natively (a CI matrix works well); Linux needs WebKitGTK 4.1+.

> If `cargo` stalls fetching crates (mirror 403 / connection reset), retry against the default registry:
> `CARGO_HOME=/tmp/cargo-home cargo build` (`set CARGO_HOME=D:\cargo-home` on Windows), or fix the mirror in `~/.cargo/config.toml`.

## Configuration

1. **Add a target row**: pick a protocol, enter the base URL (auto-completed), API key, and models — one model per line.
   Not sure which protocol the service speaks? Click **Detect protocol** next to the selector: it probes every protocol with this row's base URL and key — model list first (no tokens), then one 1-token, non-streaming completion — and scores the evidence: a 2xx with the expected shape wins, an auth rejection or matching error shape comes next (the route exists), a 404 is ruled out. The best-scoring protocol is selected automatically and a dialog lists every verdict with its evidence (including the trial model).
2. **Add more targets** to compare providers or models side by side; disable a target to keep its config but skip it in runs.
3. **Test parameters**: prompts, rounds, and advanced settings — temperature, top_p, max tokens, system prompt, concurrency.
4. **Model prices** (optional, for cost analysis): one model per line, `model=input_price,output_price` in $/1M tokens:
   ```
   gpt-4o=2.5,10
   deepseek-chat=0.27,1.1
   ```
5. **Run** — watch requests stream live, then read the statistics table and export CSV/JSON.

## Metrics Explained

| Metric | Meaning | Unit |
|--------|---------|------|
| TTFT (First Token) | Time from request sent to first response token | ms |
| Total Latency | Time from request sent to the full response | ms |
| Output Speed | Output tokens per second (total tokens / total latency) | t/s |
| TPOT | Average time per output token, excluding the first-token wait | ms/token |
| ITL | Interval between consecutive tokens (P90 / max) | ms |
| Input Speed | Input tokens / TTFT — prefill throughput | t/s |
| Cost | Computed from configured prices, per request and per model | $ |
| Success Rate | Successful requests / total requests | % |

## Privacy & Security

- API keys live only in your browser's localStorage — never sent anywhere except the endpoints you configure.
- Requests go **directly** from your browser to each endpoint. No proxy, no telemetry.
- Note: some cloud providers block browser cross-origin (CORS) requests. Local endpoints (e.g. Ollama) and CORS-friendly gateways work out of the box; for blocked providers, use a gateway that sends CORS headers or your own relay.
- Avoid entering real keys on shared machines; clear the browser storage when done.

## Project Structure

```
llm-speedtest/
├── index.html          # Single-page UI
├── app.js              # Test orchestration, statistics, history, export
├── api-handlers.js     # Protocol implementations (6 providers) & streaming parser
├── transport.js        # Transport: fetch on the web, Rust bridge on desktop
├── i18n.js             # English / 中文 translations
├── styles.css          # Styling (light theme)
├── serve.py            # Local static server (+ optional same-origin proxy)
├── start.bat           # One-click launch on Windows
├── scripts/            # Build helpers (dist/ assembly, icon generation)
├── src-tauri/          # Tauri 2 desktop shell (Rust + reqwest)
├── package.json        # Only for @tauri-apps/cli and npm scripts
└── LICENSE             # MIT
```

## Contributing

Issues and pull requests are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "feat: add amazing-feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Credits

This project is based on [llm-api-test](https://github.com/qjr87/llm-api-test) by [qjr87](https://github.com/qjr87). Thank you for the original work.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**[⭐ Star this repo](https://github.com/dianaloveava/llm-speedtest) if you find it helpful!**

Made by [dianaloveava](https://github.com/dianaloveava)

</div>
