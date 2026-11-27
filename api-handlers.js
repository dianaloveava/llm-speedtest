// API handlers for different AI provider protocols — protocol registry architecture.
// Each PROTOCOL is a declarative spec describing its wire format, auth, endpoint paths,
// request-body builder, and stream extractors. One generic APIHandler drives all behavior.

// ── Token estimation (single implementation, module scope) ─────────────────
// CJK characters ≈ 1 token each, everything else ≈ 0.25 token per character.
// Rounding happens once at the end so per-delta rounding cannot inflate the total.
function estimateRawTokens(text) {
    if (!text) return 0;
    let tokens = 0;
    for (const char of text) {
        const code = char.codePointAt(0);
        if ((code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
            (code >= 0x3000 && code <= 0x30FF) ||   // CJK punctuation, hiragana, katakana
            (code >= 0xAC00 && code <= 0xD7AF)) {  // Korean Hangul syllables
            tokens += 1;
        } else {
            tokens += 0.25;
        }
    }
    return tokens;
}

function estimateTokens(text) {
    return Math.ceil(estimateRawTokens(text));
}

// Reasoning models (o1/o3/…, gpt-5*) reject temperature/top_p and use
// max_completion_tokens / max_output_tokens instead of max_tokens.
const REASONING_MODEL_RE = /(^|[\/:-])(o[1-9]\d*|gpt-5[\w.-]*)/i;
function isReasoningModel(model) {
    return REASONING_MODEL_RE.test(String(model || ''));
}

const PROTOCOLS = {
    // ── 1. OpenAI Chat Completions ─────────────────────────────────────────
    // POST /v1/chat/completions · SSE · choices[].delta.content · Bearer auth
    'openai-chat-completions': {
        id: 'openai-chat-completions',
        label: 'OpenAI Chat Completions',
        auth: { type: 'bearer' },
        authHeader: null,
        authVersion: null,
        wire: 'sse',
        chatPath: '/v1/chat/completions',
        modelsPath: '/v1/models',
        modelsArrayKey: 'data',
        modelsIdField: 'id',
        modelsIdTransform: null,
        validFinishReasons: ['stop', 'length', 'content_filter', 'tool_calls', 'function_call'],
        limits: { temperature: 2, topP: 1 },
        buildBody(model, prompt, opts) {
            const messages = [];
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                messages.push({ role: 'system', content: opts.systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });
            const body = {
                model,
                messages,
                stream: true,
                stream_options: { include_usage: true }
            };
            if (isReasoningModel(model)) {
                body.max_completion_tokens = opts.maxTokens;
            } else {
                body.max_tokens = opts.maxTokens;
                body.temperature = opts.temperature;
                body.top_p = opts.topP;
            }
            return body;
        },
        extractDelta(json) {
            return json.choices?.[0]?.delta?.content || '';
        },
        extractFinishReason(json) {
            return json.choices?.[0]?.finish_reason || null;
        },
        extractDone() {
            return false;
        },
        extractUsage(json) {
            const u = json.usage;
            return u ? {
                input: u.prompt_tokens ?? null,
                output: u.completion_tokens ?? null,
                total: u.total_tokens ?? null,
                cached: u.prompt_tokens_details?.cached_tokens ?? null,
                reasoning: u.completion_tokens_details?.reasoning_tokens ?? null
            } : null;
        }
    },

    // ── 2. OpenAI Responses ────────────────────────────────────────────────
    // POST /v1/responses · SSE · response.output_text.delta · Bearer auth
    'openai-responses': {
        id: 'openai-responses',
        label: 'OpenAI Responses',
        auth: { type: 'bearer' },
        authHeader: null,
        authVersion: null,
        wire: 'sse',
        chatPath: '/v1/responses',
        modelsPath: '/v1/models',
        modelsArrayKey: 'data',
        modelsIdField: 'id',
        modelsIdTransform: null,
        validFinishReasons: null,   // completion is signalled by response.* events
        limits: { temperature: 2, topP: 1 },
        buildBody(model, prompt, opts) {
            const input = [];
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                input.push({ role: 'system', content: opts.systemPrompt });
            }
            input.push({ role: 'user', content: prompt });
            const body = { model, input, stream: true, max_output_tokens: opts.maxTokens };
            if (!isReasoningModel(model)) {
                body.temperature = opts.temperature;
                body.top_p = opts.topP;
            }
            return body;
        },
        extractDelta(json) {
            return json.type === 'response.output_text.delta' ? (json.delta || '') : '';
        },
        extractFinishReason(json) {
            if (json.type === 'response.completed') return 'completed';
            if (json.type === 'response.failed') return 'failed';
            if (json.type === 'response.incomplete') return 'incomplete';
            return null;
        },
        extractDone(json) {
            return json.type === 'response.completed' || json.type === 'response.failed' ||
                   json.type === 'response.incomplete';
        },
        // Returns a failure message (truthy) or null.
        doneIsFailure(json) {
            if (json.type === 'response.failed') return 'Response failed';
            if (json.type === 'response.incomplete') return 'Response incomplete';
            return null;
        },
        extractUsage(json) {
            const u = json.response?.usage;
            return u ? {
                input: u.input_tokens ?? null,
                output: u.output_tokens ?? null,
                total: u.total_tokens ?? null,
                cached: u.input_tokens_details?.cached_tokens ?? null,
                reasoning: u.output_tokens_details?.reasoning_tokens ?? null
            } : null;
        }
    },

    // ── 3. Anthropic Messages ─────────────────────────────────────────────
    // POST /v1/messages · SSE · content_block_delta / message_delta · x-api-key + version
    'anthropic-messages': {
        id: 'anthropic-messages',
        label: 'Anthropic Messages',
        auth: { type: 'x-api-key' },
        authHeader: 'x-api-key',
        authVersion: '2023-06-01',
        // Browser origin is not Anthropic's; without this header the preflight fails.
        extraHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
        wire: 'sse',
        chatPath: '/v1/messages',
        modelsPath: '/v1/models',
        modelsArrayKey: 'data',
        modelsIdField: 'id',
        modelsIdTransform: null,
        validFinishReasons: ['end_turn', 'max_tokens', 'stop_sequence', 'refusal', 'tool_use'],
        limits: { temperature: 1, topP: 1 },
        buildBody(model, prompt, opts) {
            const body = {
                model,
                max_tokens: opts.maxTokens,
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                temperature: opts.temperature,
                top_p: opts.topP
            };
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                body.system = opts.systemPrompt;
            }
            return body;
        },
        extractDelta(json) {
            return json.type === 'content_block_delta' ? (json.delta?.text || '') : '';
        },
        extractFinishReason(json) {
            return json.type === 'message_delta' ? (json.delta?.stop_reason || null) : null;
        },
        extractDone(json) {
            return json.type === 'message_stop';
        },
        extractUsage(json) {
            if (json.type === 'message_start') {
                const u = json.message?.usage || {};
                if (u.input_tokens == null) return null;
                return {
                    input: u.input_tokens,
                    cached: (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) || null
                };
            }
            if (json.type === 'message_delta') {
                const v = json.usage?.output_tokens;
                return v != null ? { output: v } : null;
            }
            return null;
        }
    },

    // ── 4. Google Generative AI ────────────────────────────────────────────
    // POST /v1beta/models/{model}:streamGenerateContent?alt=sse · SSE
    // candidates[0].content.parts[0].text · x-goog-api-key header
    'google-generative-ai': {
        id: 'google-generative-ai',
        label: 'Google Generative AI',
        auth: { type: 'header-key' },
        authHeader: 'x-goog-api-key',
        authVersion: null,
        wire: 'sse',
        chatPath: '/v1beta/models/{model}:streamGenerateContent',
        modelsPath: '/v1beta/models',
        modelsArrayKey: 'models',
        modelsIdField: 'name',
        modelsIdTransform: name => String(name || '').replace('models/', ''),
        validFinishReasons: ['STOP', 'MAX_TOKENS'],
        limits: { temperature: 2, topP: 1 },
        buildBody(model, prompt, opts) {
            const body = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: opts.maxTokens,
                    temperature: opts.temperature,
                    topP: opts.topP
                }
            };
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
            }
            return body;
        },
        extractDelta(json) {
            return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        },
        extractFinishReason(json) {
            return json.candidates?.[0]?.finishReason || null;
        },
        extractDone() {
            return false;
        },
        extractUsage(json) {
            const u = json.usageMetadata;
            return u ? {
                input: u.promptTokenCount ?? null,
                output: u.candidatesTokenCount ?? null,
                total: u.totalTokenCount ?? null,
                thoughts: u.thoughtsTokenCount ?? null,
                reasoning: u.thoughtsTokenCount ?? null,
                cached: u.cachedContentTokenCount ?? null
            } : null;
        }
    },

    // ── 5. Ollama Chat ─────────────────────────────────────────────────────
    // POST /api/chat · NDJSON · message.content · done:true · no auth (Bearer optional for remote)
    'ollama-chat': {
        id: 'ollama-chat',
        label: 'Ollama Chat',
        auth: { type: 'none' },
        authHeader: null,
        authVersion: null,
        wire: 'ndjson',
        chatPath: '/api/chat',
        modelsPath: '/api/tags',
        modelsArrayKey: 'models',
        modelsIdField: 'name',
        modelsIdTransform: null,
        validFinishReasons: null,   // the done frame decides; see doneIsFailure
        limits: { temperature: 2, topP: 1 },
        buildBody(model, prompt, opts) {
            const messages = [];
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                messages.push({ role: 'system', content: opts.systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });
            return {
                model,
                messages,
                stream: true,
                options: {
                    temperature: opts.temperature,
                    top_p: opts.topP,
                    num_predict: opts.maxTokens
                }
            };
        },
        extractDelta(json) {
            return json.message?.content || '';
        },
        extractFinishReason(json) {
            return json.done ? (json.done_reason || null) : null;
        },
        extractDone(json) {
            return json.done === true;
        },
        doneIsFailure(json) {
            if (json.done === true && json.done_reason === 'length') return 'Output truncated (length)';
            return null;
        },
        extractUsage(json) {
            if (!json.done) return null;
            const input = json.prompt_eval_count ?? null;
            const output = json.eval_count ?? null;
            return { input, output, total: (input != null && output != null) ? input + output : null };
        }
    },

    // ── 6. Cohere Chat ─────────────────────────────────────────────────────
    // POST /v2/chat · SSE · content-delta / message-end · Bearer auth
    'cohere-chat': {
        id: 'cohere-chat',
        label: 'Cohere Chat',
        auth: { type: 'bearer' },
        authHeader: null,
        authVersion: null,
        wire: 'sse',
        chatPath: '/v2/chat',
        modelsPath: '/v1/models',
        modelsArrayKey: 'models',
        modelsIdField: 'name',
        modelsIdTransform: null,
        validFinishReasons: ['COMPLETE', 'STOP_SEQUENCE'],
        limits: { temperature: 1, topP: 0.99 },
        buildBody(model, prompt, opts) {
            const messages = [];
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                messages.push({ role: 'system', content: opts.systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });
            return {
                model,
                messages,
                stream: true,
                temperature: opts.temperature,
                top_p: opts.topP,
                max_tokens: opts.maxTokens
            };
        },
        extractDelta(json) {
            return json.type === 'content-delta' ? (json.delta?.message?.content?.text || '') : '';
        },
        extractFinishReason(json) {
            return json.delta?.finish_reason ?? json.finish_reason ?? null;
        },
        extractDone(json) {
            return json.type === 'message-end';
        },
        extractUsage(json) {
            // v2 puts usage inside delta.usage.tokens; older payloads use the top level.
            const u = json.delta?.usage?.tokens || json.usage?.tokens;
            if (!u) return null;
            const input = u.input_tokens ?? u.billed_units?.input_tokens ?? null;
            const output = u.output_tokens ?? u.billed_units?.output_tokens ?? null;
            return {
                input,
                output,
                total: (input != null && output != null) ? input + output : null,
                cached: u.cached_tokens ?? u.billed_units?.cached_tokens ?? null
            };
        }
    }
};

// ── Protocol default base URLs ────────────────────────────────────────────
// Each protocol has one canonical default base URL. Users may override with any custom URL.
const PROTOCOL_DEFAULTS = {
    'openai-chat-completions':  'https://api.openai.com',
    'openai-responses':         'https://api.openai.com',
    'anthropic-messages':       'https://api.anthropic.com',
    'google-generative-ai':     'https://generativelanguage.googleapis.com',
    'ollama-chat':              'http://localhost:11434',
    'cohere-chat':              'https://api.cohere.com',
};

const DEFAULT_LIMITS = { temperature: 2, topP: 1 };

// ── Smart URL completion ───────────────────────────────────────────────────
// Appends only the missing trailing portion of fullPath that the user hasn't already typed.
// Query string / fragment of the base URL are preserved, never matched against.
// Examples (fullPath = "/v1/chat/completions"):
//   "http://127.0.0.1:18080"          → "http://127.0.0.1:18080/v1/chat/completions"
//   "http://127.0.0.1:18080/v1"       → "http://127.0.0.1:18080/v1/chat/completions"
//   "http://127.0.0.1:18080/v1/chat"  → "http://127.0.0.1:18080/v1/chat/completions"
//   "http://127.0.0.1:18080/v1/chat/completions" → unchanged
//   "http://127.0.0.1:18080/v1/"      → strip trailing slash first, then complete
function smartCompleteUrl(baseUrl, fullPath) {
    const raw = (baseUrl || '').trim();
    let base = raw;
    let suffix = '';

    try {
        const u = new URL(raw);
        base = u.origin + u.pathname;
        suffix = u.search + u.hash;
    } catch (_) {
        // Not an absolute URL — strip query/hash textually instead.
        const hashIdx = raw.indexOf('#');
        if (hashIdx >= 0) {
            suffix = raw.slice(hashIdx);
            base = raw.slice(0, hashIdx);
        }
        const qIdx = base.indexOf('?');
        if (qIdx >= 0) {
            suffix = base.slice(qIdx) + suffix;
            base = base.slice(0, qIdx);
        }
    }

    while (base.endsWith('/')) base = base.slice(0, -1);
    if (!fullPath) return base + suffix;

    const path = fullPath.startsWith('/') ? fullPath : '/' + fullPath;
    if (base.endsWith(path)) return base + suffix;
    // Longest prefix of the path that the base already ends with wins.
    for (let i = path.length - 1; i >= 1; i--) {
        const candidate = path.slice(0, i);
        // candidate always starts with '/', so the match lands on a segment boundary.
        if (base.endsWith(candidate)) return base + path.slice(i) + suffix;
    }
    return base + path + suffix;
}

// Collapse verbose/HTML error bodies (e.g. CDN 5xx pages) into a short readable message
function sanitizeErrorBody(text) {
    if (!text) return '';
    const t = String(text).trim();
    if (t.startsWith('<')) {
        const m = t.match(/<title[^>]*>([^<]*)<\/title>/i);
        return m ? m[1].trim() : '(HTML error page omitted)';
    }
    return t.replace(/\s+/g, ' ').slice(0, 200);
}

function sleepAbortable(ms, signal) {
    return new Promise(resolve => {
        if (signal && signal.aborted) { resolve(); return; }
        const timer = setTimeout(() => {
            if (signal) signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        function onAbort() {
            clearTimeout(timer);
            resolve();
        }
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
}

// ── Protocol detection ───────────────────────────────────────────────────
// Probes every protocol with the cheapest requests that still yield evidence:
// the model list (no tokens) plus one 1-token, non-streaming completion. A 2xx
// outranks an error body whose *shape* proves the route exists, so a wrong API
// key narrows the candidates instead of hiding them.

const DETECT_MODELS = {
    'openai-chat-completions': 'gpt-4o-mini',
    'openai-responses': 'gpt-4o-mini',
    'anthropic-messages': 'claude-3-5-haiku-latest',
    'google-generative-ai': 'gemini-2.0-flash',
    'ollama-chat': 'llama3.2',
    'cohere-chat': 'command-r7b-12-2024'
};

const DETECT_SHAPE = {
    'openai-chat-completions': {
        models: j => Array.isArray(j.data) && j.data.some(m => m && typeof m.id === 'string'),
        ok: j => Array.isArray(j.choices) && j.choices.length > 0,
        error: j => !!(j.error && typeof j.error === 'object')
    },
    'openai-responses': {
        models: j => Array.isArray(j.data) && j.data.some(m => m && typeof m.id === 'string'),
        ok: j => Array.isArray(j.output) || j.object === 'response' || !!(j.response && Array.isArray(j.response.output)),
        error: j => !!(j.error && typeof j.error === 'object')
    },
    'anthropic-messages': {
        models: j => Array.isArray(j.data) && j.data.some(m => m && typeof m.id === 'string'),
        ok: j => Array.isArray(j.content) || j.type === 'message',
        error: j => j.type === 'error' && !!j.error
    },
    'google-generative-ai': {
        models: j => Array.isArray(j.models) && j.models.some(m => m && typeof m.name === 'string'),
        ok: j => Array.isArray(j.candidates),
        error: j => !!(j.error && (j.error.status || Number.isFinite(j.error.code)))
    },
    'ollama-chat': {
        models: j => Array.isArray(j.models) && j.models.some(m => m && (typeof m.name === 'string' || typeof m.model === 'string')),
        ok: j => !!(j.message || typeof j.done === 'boolean'),
        error: j => typeof j.error === 'string'
    },
    'cohere-chat': {
        models: j => Array.isArray(j.models) && j.models.some(m => m && typeof m.name === 'string'),
        ok: j => !!(j.message && typeof j.message === 'object'),
        error: j => typeof j.message === 'string' && !j.error
    }
};

async function requestOnce(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
        const response = await appFetch(url, Object.assign({}, init, { signal: controller.signal }));
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
    } finally {
        clearTimeout(timer);
    }
}

function parseJsonOrNull(text) {
    try {
        return JSON.parse(text);
    } catch (_) {
        return null;
    }
}

class APIHandler {
    constructor(protocol, baseUrl, apiKey, options = {}) {
        this.protocol = protocol;
        this.spec = APIHandler.getProtocol(protocol);
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.options = {
            maxTokens: options.maxTokens ?? 1000,
            temperature: options.temperature ?? 0.7,
            topP: options.topP ?? 1,
            systemPrompt: options.systemPrompt ?? ''
        };
        this.timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
            ? options.timeoutMs
            : 120000;
    }

    getChatPath() {
        return this.spec.chatPath;
    }

    getModelsPath() {
        return this.spec.modelsPath;
    }

    // Internal AbortController that fires on user abort or timeout.
    buildSignal(userSignal) {
        const controller = new AbortController();
        const onUserAbort = () => controller.abort('user');
        if (userSignal) {
            if (userSignal.aborted) controller.abort('user');
            else userSignal.addEventListener('abort', onUserAbort, { once: true });
        }
        const timer = setTimeout(() => controller.abort('timeout'), this.timeoutMs);
        const cleanup = () => {
            clearTimeout(timer);
            if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
        };
        return { signal: controller.signal, cleanup };
    }

    buildHeaders(extra) {
        const spec = this.spec;
        const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
        switch (spec.auth.type) {
            case 'bearer':
                headers['Authorization'] = `Bearer ${this.apiKey}`;
                break;
            case 'x-api-key':
                headers[spec.authHeader] = this.apiKey;
                if (spec.authVersion) headers['anthropic-version'] = spec.authVersion;
                break;
            case 'header-key':
                headers[spec.authHeader] = this.apiKey;
                break;
            case 'none':
                // Ollama: no auth by default, but support Bearer for remote instances
                if (this.apiKey && this.apiKey.trim()) headers['Authorization'] = `Bearer ${this.apiKey}`;
                break;
        }
        if (spec.extraHeaders) Object.assign(headers, spec.extraHeaders);
        return headers;
    }

    // Build the chat request { url, headers, body } for a model+prompt
    buildChatRequest(model, prompt) {
        const spec = this.spec;
        const chatPath = this.getChatPath();
        let url;
        if (spec.id === 'google-generative-ai') {
            // Keep path separators inside the model id; the key travels in a header.
            const encodedModel = String(model).split('/').map(encodeURIComponent).join('/');
            url = smartCompleteUrl(this.baseUrl, chatPath.replace('{model}', encodedModel)) + '?alt=sse';
        } else {
            url = smartCompleteUrl(this.baseUrl, chatPath);
        }

        const headers = this.buildHeaders({ 'Accept': 'text/event-stream' });
        const body = spec.buildBody(model, prompt, this.options);
        return { url, headers, body };
    }

    // Fetch model list → string[]
    // GET request for the model list — shared by fetchModels and detection.
    modelsRequest() {
        const modelsPath = this.getModelsPath();
        const url = this.protocol === 'google-generative-ai'
            ? smartCompleteUrl(this.baseUrl, modelsPath) + '?pageSize=1000'
            : smartCompleteUrl(this.baseUrl, modelsPath);
        return { url, headers: this.buildHeaders() };
    }

    async fetchModels(signal) {
        const spec = this.spec;
        const { url, headers } = this.modelsRequest();

        // GET is idempotent — retry transient failures (network errors / 5xx)
        // up to 3 times with backoff. Waits are abort-aware.
        const MAX_ATTEMPTS = 3;
        let response = null;
        let fetchErr = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (signal && signal.aborted) break;
            fetchErr = null;
            try {
                response = await appFetch(url, { method: 'GET', headers, signal });
                if (!response.ok && response.status < 500) break;   // 4xx fails fast
            } catch (err) {
                if (signal && signal.aborted) throw new Error('Cancelled by user');
                if (err && err.name === 'AbortError') throw new Error('Cancelled by user');
                response = null;
                fetchErr = err;
            }
            if ((fetchErr || (response && response.status >= 500)) && attempt < MAX_ATTEMPTS) {
                if (response && response.body) {
                    try { await response.body.cancel(); } catch (_) { /* already consumed */ }
                }
                await sleepAbortable(800 * attempt, signal);
            }
        }

        if (fetchErr) throw new Error('Network error: ' + fetchErr.message);
        if (!response) throw new Error('Network error: no response');
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HTTP ${response.status}: ${sanitizeErrorBody(errorData)}`);
        }

        const json = await response.json();
        const arr = json[spec.modelsArrayKey] || [];
        return arr.map(m => {
            const id = m[spec.modelsIdField];
            return spec.modelsIdTransform ? spec.modelsIdTransform(id) : id;
        }).filter(id => id);
    }

    // Test a single model → result object
    async testModel(model, prompt, onProgress, signal) {
        const startTime = Date.now();
        const { signal: ctlSignal, cleanup } = this.buildSignal(signal);

        const abortResult = () => {
            const timeout = ctlSignal.reason === 'timeout';
            return {
                firstTokenTime: null,
                ttfb: null,
                genTime: null,
                httpStatus: null,
                outputSpeed: '0.00',
                totalTokens: 0,
                totalLatency: Date.now() - startTime,
                usage: null,
                tokenTimes: [],
                finishReason: null,
                result: '',
                error: timeout ? `Timeout after ${this.timeoutMs / 1000}s` : 'Cancelled by user',
                status: timeout ? 'failed' : 'cancelled',
                aborted: true
            };
        };

        try {
            const built = this.buildChatRequest(model, prompt);
            let response = await appFetch(built.url, {
                method: 'POST',
                headers: built.headers,
                body: JSON.stringify(built.body),
                signal: ctlSignal
            });
            // Headers are in: this is the first byte the client could read.
            let ttfb = Date.now() - startTime;

            if (!response.ok) {
                const errorData = await response.text();
                // Some OpenAI-compatible gateways reject stream_options outright —
                // retry the same request once without it.
                if (response.status === 400 && built.body.stream_options && /stream_options/i.test(errorData)) {
                    const retryBody = Object.assign({}, built.body);
                    delete retryBody.stream_options;
                    response = await appFetch(built.url, {
                        method: 'POST',
                        headers: built.headers,
                        body: JSON.stringify(retryBody),
                        signal: ctlSignal
                    });
                    ttfb = Date.now() - startTime;
                    if (!response.ok) {
                        const retryData = await response.text();
                        throw new Error(`HTTP ${response.status}: ${sanitizeErrorBody(retryData)}`);
                    }
                } else {
                    throw new Error(`HTTP ${response.status}: ${sanitizeErrorBody(errorData)}`);
                }
            }

            const streamResult = await this.processStream(response, startTime, onProgress, ctlSignal, {
                ttfb,
                httpStatus: response.status
            });
            streamResult.usage = streamResult.usage || null;
            streamResult.inputTokens = streamResult.usage?.input ?? estimateTokens(prompt);
            if (streamResult.usage?.output != null) streamResult.totalTokens = streamResult.usage.output;
            return streamResult;
        } catch (err) {
            if (ctlSignal.aborted || (err && err.name === 'AbortError')) {
                const result = abortResult();
                if (onProgress) onProgress(result);
                return result;
            }
            const errorResult = {
                firstTokenTime: null,
                outputSpeed: '0.00',
                totalTokens: 0,
                totalLatency: Date.now() - startTime,
                usage: null,
                tokenTimes: [],
                finishReason: null,
                result: '',
                error: (err && err.message) || String(err),
                status: 'failed'
            };
            if (onProgress) onProgress(errorResult);
            return errorResult;
        } finally {
            cleanup();
        }
    }

    // Unified stream processor for sse + ndjson.
    // Handles \n and \r\n, aggregates multi-line SSE events, flushes the tail
    // (usage / done frames often arrive last), and always ends in finalizeStream.
    async processStream(response, startTime, onProgress, signal, meta = {}) {
        const spec = this.spec;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const state = {
            startTime,
            ttfb: meta.ttfb ?? null,
            httpStatus: meta.httpStatus ?? null,
            firstTokenTime: null,
            estRaw: 0,
            result: '',
            finishReason: null,
            tokenTimes: [],
            usage: null,
            badFrames: 0,
            doneFailure: null,
            aborted: false,
            abortReason: null
        };
        const markAborted = () => {
            state.aborted = true;
            state.abortReason = (signal && signal.reason === 'timeout') ? 'timeout' : 'user';
        };
        const eventData = [];
        let buffer = '';
        let finished = false;

        const emitProgress = () => {
            if (!onProgress) return;
            const elapsed = Math.max(1, Date.now() - startTime) / 1000;
            const tokens = Math.ceil(state.estRaw);
            onProgress({
                firstTokenTime: state.firstTokenTime,
                outputSpeed: (tokens / elapsed).toFixed(2),
                totalTokens: tokens,
                result: state.result,
                error: null,
                status: 'testing'
            });
        };

        // Process one raw payload. Returns true when the stream is complete.
        const dispatch = (raw) => {
            if (raw === '[DONE]') return true;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (_) {
                state.badFrames++;
                return false;
            }
            if (!parsed || typeof parsed !== 'object') {
                state.badFrames++;
                return false;
            }

            // In-stream error frames → throw so classifyError can bucket them.
            if (parsed.type === 'error' || (parsed.error && typeof parsed.error === 'object') ||
                (typeof parsed.error === 'string' && parsed.error.length > 0)) {
                const e = parsed.error;
                const msg = (e && typeof e === 'object' ? (e.message || e.code || e.type) : e) || 'Stream error';
                const status = (e && typeof e === 'object' && (e.status || e.code)) || 500;
                throw new Error(`HTTP ${status}: ${msg}`);
            }

            const u = spec.extractUsage ? spec.extractUsage(parsed) : null;
            if (u) {
                // Copy whatever the protocol reported — usage frames arrive in
                // pieces (Anthropic sends input first, output later) and new
                // fields (cache, reasoning) must not be dropped by a whitelist.
                state.usage = state.usage || {};
                for (const [field, value] of Object.entries(u)) {
                    if (value !== null && value !== undefined) state.usage[field] = value;
                }
            }

            const content = spec.extractDelta(parsed);
            const currentFinish = spec.extractFinishReason(parsed);
            if (currentFinish) state.finishReason = currentFinish;
            if (spec.doneIsFailure) {
                const failure = spec.doneIsFailure(parsed);
                if (failure) state.doneFailure = failure;
            }

            if (content) {
                if (state.firstTokenTime === null) state.firstTokenTime = Date.now() - startTime;
                state.tokenTimes.push(Date.now() - startTime);
                state.result += content;
                state.estRaw += estimateRawTokens(content);
                emitProgress();
            }

            return !!spec.extractDone(parsed);
        };

        // Returns true when the stream is complete.
        const handleLines = (lines) => {
            for (const line of lines) {
                if (spec.wire === 'sse') {
                    const clean = line.endsWith('\r') ? line.slice(0, -1) : line;
                    if (clean === '') {
                        // Blank line terminates the current event.
                        if (eventData.length) {
                            const raw = eventData.join('\n');
                            eventData.length = 0;
                            if (dispatch(raw)) return true;
                        }
                        continue;
                    }
                    if (!clean.startsWith('data:')) continue;   // event:/id:/retry:/comments
                    let payload = clean.slice(5);
                    if (payload.startsWith(' ')) payload = payload.slice(1);
                    eventData.push(payload);
                } else {
                    const clean = line.endsWith('\r') ? line.slice(0, -1) : line;
                    if (!clean.trim()) continue;
                    if (dispatch(clean)) return true;
                }
            }
            return false;
        };

        try {
            while (!finished) {
                if (signal && signal.aborted) {
                    markAborted();
                    break;
                }
                let chunk;
                try {
                    chunk = await reader.read();
                } catch (err) {
                    if ((signal && signal.aborted) || (err && err.name === 'AbortError')) {
                        markAborted();
                        break;
                    }
                    throw err;
                }
                if (chunk.done) {
                    buffer += decoder.decode();
                    // The tail has no trailing newline — it is still a complete line.
                    const tail = buffer;
                    buffer = '';
                    if (tail.length && handleLines([tail])) finished = true;
                    break;
                }
                buffer += decoder.decode(chunk.value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? '';
                if (handleLines(lines)) finished = true;
            }

            // Flush a trailing SSE event that never got its blank line.
            if (!finished && spec.wire === 'sse' && eventData.length) {
                const raw = eventData.join('\n');
                eventData.length = 0;
                try { finished = dispatch(raw); } catch (err) { throw err; }
            }
        } finally {
            try { reader.cancel().catch(() => { /* already closed */ }); } catch (_) { /* noop */ }
            try { reader.releaseLock(); } catch (_) { /* noop */ }
        }

        return this.finalizeStream(state, spec);
    }

    // Single exit point for every stream path: success, done-frame, abort, timeout.
    finalizeStream(state, spec) {
        const elapsed = Math.max(1, Date.now() - state.startTime);
        const estimated = Math.ceil(state.estRaw);
        const finalTokens = state.usage?.output != null ? state.usage.output : estimated;
        const hasResult = !!(state.result && state.result.trim().length > 0);
        const timeout = state.aborted && state.abortReason === 'timeout';

        let status = 'completed';
        let error = null;

        if (state.aborted) {
            status = timeout ? 'failed' : 'cancelled';
            error = timeout ? `Timeout after ${this.timeoutMs / 1000}s` : 'Cancelled by user';
        } else if (state.doneFailure) {
            status = 'failed';
            error = state.doneFailure;
        } else if (spec.validFinishReasons !== null &&
                   !spec.validFinishReasons.includes(state.finishReason)) {
            status = 'failed';
            error = `Invalid finish_reason: ${state.finishReason || 'missing'}`;
        }

        // An empty body is always a failure, whatever the provider claimed —
        // except for a user cancel, which keeps its own status.
        if (!hasResult && !state.aborted) {
            status = 'failed';
            error = state.badFrames > 0
                ? `Invalid stream payload (${state.badFrames} frames skipped)`
                : 'Empty response (no content received)';
        }

        return {
            firstTokenTime: state.firstTokenTime,
            ttfb: state.ttfb,
            httpStatus: state.httpStatus,
            genTime: state.firstTokenTime != null ? Math.max(0, elapsed - state.firstTokenTime) : null,
            outputSpeed: (finalTokens > 0 ? finalTokens / (elapsed / 1000) : 0).toFixed(2),
            totalTokens: finalTokens,
            totalLatency: elapsed,
            usage: state.usage,
            tokenTimes: state.tokenTimes,
            finishReason: state.finishReason,
            result: state.result,
            error,
            status,
            aborted: !!state.aborted
        };
    }

    estimateTokens(text) {
        return estimateTokens(text);
    }

    // ── Protocol detection ────────────────────────────────────────────────
    // Try every protocol against one base URL and rank by evidence.
    static async detectProtocol(baseUrl, apiKey, model, options = {}) {
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
        const ids = Object.keys(PROTOCOLS);
        const results = await Promise.all(ids.map(id =>
            APIHandler.probeProtocol(id, baseUrl, apiKey, model, timeoutMs)));
        results.sort((a, b) => (b.score - a.score) || (ids.indexOf(a.protocol) - ids.indexOf(b.protocol)));
        return {
            best: results.length && results[0].score >= 3 ? results[0].protocol : null,
            results
        };
    }

    // One protocol, two requests. Never throws: the outcome is part of the result.
    static async probeProtocol(id, baseUrl, apiKey, model, timeoutMs) {
        const spec = PROTOCOLS[id];
        const shapes = DETECT_SHAPE[id];
        const typed = String(model || '').trim();
        const probeModel = typed || DETECT_MODELS[id];
        const handler = new APIHandler(id, baseUrl, apiKey, { maxTokens: 1, temperature: 0, topP: 1 });
        const result = {
            protocol: id,
            label: spec.label,
            model: probeModel,
            usingDefaultModel: !typed,
            score: 0,
            ok: false,
            stage: null,
            modelsStatus: null,
            chatStatus: null,
            reason: null
        };

        // Stage 1 — model list, no tokens spent.
        try {
            const { url, headers } = handler.modelsRequest();
            const res = await requestOnce(url, { method: 'GET', headers }, timeoutMs);
            result.modelsStatus = res.status;
            const json = res.ok ? parseJsonOrNull(res.text) : null;
            if (json && typeof json === 'object' && shapes.models(json)) {
                result.score += 3;
                result.stage = 'models';
                result.reason = 'models';
            }
        } catch (_) {
            // A dead models route says nothing about the chat route.
        }

        // Stage 2 — one minimal completion, streaming off (Gemini uses the
        // non-SSE generateContent path so no ?alt=sse is needed).
        const chatUrl = id === 'google-generative-ai'
            ? smartCompleteUrl(baseUrl, '/v1beta/models/' + probeModel.split('/').map(encodeURIComponent).join('/') + ':generateContent')
            : smartCompleteUrl(baseUrl, spec.chatPath);
        const body = spec.buildBody(probeModel, 'ping', { maxTokens: 1, temperature: 0, topP: 1, systemPrompt: '' });
        if (id !== 'google-generative-ai') body.stream = false;
        if (body.stream_options) delete body.stream_options;

        try {
            const res = await requestOnce(chatUrl, {
                method: 'POST',
                headers: handler.buildHeaders(),
                body: JSON.stringify(body)
            }, timeoutMs);
            const json = parseJsonOrNull(res.text);
            result.chatStatus = res.status;
            if (res.ok) {
                result.stage = 'chat';
                if (json && typeof json === 'object' && shapes.ok(json)) {
                    result.score += 10;
                    result.ok = true;
                    result.reason = 'ok';
                } else {
                    result.score += 6;
                    result.reason = 'okBody';
                }
            } else if (res.status === 404 || res.status === 405) {
                // A missing route is a missing route, whatever the body looks like.
                result.reason = res.status === 404 ? 'notFound' : 'method';
            } else if (json && typeof json === 'object' && shapes.error(json)) {
                result.score += 5;
                result.stage = 'chat';
                result.reason = res.status === 401 || res.status === 403 ? 'auth' : 'error';
            } else {
                result.reason = 'http';
            }
        } catch (err) {
            const msg = String((err && err.message) || err);
            result.reason = /abort|timed? ?out|timeout/i.test(msg) ? 'timeout' : 'network';
        }
        return result;
    }

    // ── Static helpers ─────────────────────────────────────────────────────
    static estimateTokens(text) {
        return estimateTokens(text);
    }

    static smartCompleteUrl(baseUrl, fullPath) {
        return smartCompleteUrl(baseUrl, fullPath);
    }

    static getProtocol(protocol) {
        return PROTOCOLS[protocol] || null;
    }

    static listProtocols() {
        return Object.keys(PROTOCOLS).map(id => ({ id, label: PROTOCOLS[id].label }));
    }

    static getDefaultBaseUrl(protocol) {
        return PROTOCOL_DEFAULTS[protocol] || '';
    }

    static getLimits(protocol) {
        const spec = PROTOCOLS[protocol];
        return (spec && spec.limits) || DEFAULT_LIMITS;
    }

    static getAllDefaultBaseUrls() {
        return new Set(Object.values(PROTOCOL_DEFAULTS));
    }

    // All known full chat URLs (for URL completion detection)
    static getAllChatUrls() {
        const urls = new Set();
        for (const [protocol, base] of Object.entries(PROTOCOL_DEFAULTS)) {
            const spec = PROTOCOLS[protocol];
            if (protocol === 'google-generative-ai') {
                urls.add(`${base}/v1beta/models`);
            } else {
                urls.add(`${base}${spec.chatPath}`);
            }
        }
        return urls;
    }

    static validateConfig(protocol, baseUrl, apiKey, models, prompts) {
        const errors = [];
        const spec = PROTOCOLS[protocol];

        if (!spec) errors.push('Unsupported protocol');
        if (!baseUrl || !this.isValidUrl(baseUrl)) errors.push('Valid API Base URL is required');

        // Ollama with none auth doesn't need a key; others do
        if (spec && spec.auth.type !== 'none' && (!apiKey || apiKey.trim().length === 0)) {
            errors.push('API Key is required');
        }
        if (!models || models.length === 0) errors.push('At least one model is required');
        if (!prompts || prompts.length === 0) errors.push('At least one prompt is required');

        return errors;
    }

    static isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}
