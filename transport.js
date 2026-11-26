// Transport layer.
//
// Browser: plain fetch — subject to the page's CORS rules.
// Tauri shell: every request is handed to Rust (reqwest) over the IPC channel.
// There is no browser origin in that path, so CORS, preflights and the
// localhost-vs-127.0.0.1 trap simply do not exist. The response shim below
// mimics the parts of fetch() this app uses: ok/status/headers/body.getReader(),
// text() and json() — with bytes streamed as they arrive so first-token latency
// and output speed stay accurate.
(function () {
    const core = (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core) || null;
    const invoke = core && typeof core.invoke === 'function' ? core.invoke.bind(core) : null;
    const Channel = core ? core.Channel : null;

    if (!invoke || typeof Channel !== 'function') {
        window.appFetch = (url, init) => fetch(url, init);
        window.appTransport = 'web';
        return;
    }

    let nextId = 1;

    function headerMap(list) {
        const map = new Map();
        (list || []).forEach(entry => {
            if (Array.isArray(entry) && entry.length >= 2) {
                map.set(String(entry[0]).toLowerCase(), String(entry[1]));
            }
        });
        return map;
    }

    function toHeaderList(raw) {
        const list = [];
        if (!raw) return list;
        if (typeof raw.forEach === 'function' && !Array.isArray(raw)) {
            raw.forEach((value, name) => list.push([String(name), String(value)]));
        } else if (Array.isArray(raw)) {
            raw.forEach(entry => {
                if (Array.isArray(entry) && entry.length >= 2) list.push([String(entry[0]), String(entry[1])]);
            });
        } else {
            Object.keys(raw).forEach(name => {
                const value = raw[name];
                if (value !== undefined && value !== null) list.push([name, String(value)]);
            });
        }
        return list;
    }

    function abortError() {
        return typeof DOMException === 'function'
            ? new DOMException('Aborted', 'AbortError')
            : Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }

    window.appFetch = async function appFetch(url, init) {
        const options = init || {};
        const id = nextId++;
        const signal = options.signal || null;

        const channel = new Channel();
        let controller = null;
        let started = false;
        let finished = false;
        let resolveStart = null;
        let rejectStart = null;
        const startGate = new Promise((resolve, reject) => {
            resolveStart = resolve;
            rejectStart = reject;
        });

        const stream = new ReadableStream({
            start(c) { controller = c; },
            cancel() { invoke('http_cancel', { id }).catch(() => {}); }
        });

        const fail = (err) => {
            if (controller) {
                try { controller.error(err); } catch (_) { /* already closed */ }
            }
        };

        channel.onmessage = (msg) => {
            if (!msg || typeof msg !== 'object') return;
            switch (msg.type) {
                case 'start':
                    started = true;
                    resolveStart({ status: msg.status, headers: msg.headers });
                    break;
                case 'chunk':
                    if (!finished && controller) {
                        try { controller.enqueue(new Uint8Array(msg.data || [])); } catch (_) { /* consumer gone */ }
                    }
                    break;
                case 'end':
                    finished = true;
                    if (!started) rejectStart(new Error('Response ended before it started'));
                    if (controller) {
                        try { controller.close(); } catch (_) { /* already closed */ }
                    }
                    break;
                case 'error': {
                    finished = true;
                    const err = new Error(msg.message || 'Request failed');
                    if (!started) rejectStart(err);
                    else fail(err);
                    break;
                }
                default:
                    break;
            }
        };

        const onAbort = () => {
            invoke('http_cancel', { id }).catch(() => {});
            if (!started) rejectStart(abortError());
            fail(abortError());
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
            } else {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        }

        invoke('http_stream', {
            id,
            req: {
                url: String(url),
                method: String(options.method || 'GET').toUpperCase(),
                headers: toHeaderList(options.headers),
                body: options.body === undefined || options.body === null ? null : String(options.body)
            },
            onEvent: channel
        }).catch(err => {
            const message = err && err.message ? err.message : String(err);
            if (!started) rejectStart(new Error(message));
            else fail(new Error(message));
        }).finally(() => {
            if (signal) signal.removeEventListener('abort', onAbort);
        });

        let meta;
        try {
            meta = await startGate;
        } catch (err) {
            finished = true;
            fail(err);
            throw err;
        }

        const headers = headerMap(meta.headers);
        return {
            ok: meta.status >= 200 && meta.status < 300,
            status: meta.status,
            statusText: '',
            headers: {
                get: (name) => (headers.has(String(name).toLowerCase()) ? headers.get(String(name).toLowerCase()) : null)
            },
            body: stream,
            text: () => new Response(stream).text(),
            json: () => new Response(stream).json()
        };
    };

    window.appTransport = 'tauri';
})();
