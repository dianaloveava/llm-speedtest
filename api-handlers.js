// API handlers for different AI provider protocols — protocol registry architecture.
// Each PROTOCOL is a declarative spec describing its wire format, auth, endpoint paths,
// request-body builder, and stream extractors. One generic APIHandler drives all behavior.
// PROVIDERS map vendor presets → protocol + defaultBaseUrl (presets share a protocol spec).

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
        validFinishReasons: ['stop', 'length'],
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
                stream_options: { include_usage: true },
                max_tokens: opts.maxTokens,
                temperature: opts.temperature,
                top_p: opts.topP
            };
        },
        extractDelta(json) {
            return json.choices?.[0]?.delta?.content || '';
        },
        extractFinishReason(json) {
            return json.choices?.[0]?.finish_reason || null;
        },
        extractDone(json) {
            return false;
        },
        extractUsage(json) {
            const u = json.usage;
            return u ? { input: u.prompt_tokens ?? null, output: u.completion_tokens ?? null, total: u.total_tokens ?? null } : null;
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
        validFinishReasons: null,  // response.completed event signals completion
        buildBody(model, prompt, opts) {
            const input = [];
            if (opts.systemPrompt && opts.systemPrompt.trim()) {
                input.push({ role: 'system', content: opts.systemPrompt });
            }
            input.push({ role: 'user', content: prompt });
            return {
                model,
                input,
                stream: true,
                max_output_tokens: opts.maxTokens,
                temperature: opts.temperature,
                top_p: opts.topP
            };
        },
        extractDelta(json) {
            // Text deltas come as response.output_text.delta events
            if (json.type === 'response.output_text.delta') {
                return json.delta || '';
            }
            return '';
        },
        extractFinishReason(json) {
            // response.completed / response.failed / response.incomplete
            if (json.type === 'response.completed') return 'completed';
            if (json.type === 'response.failed') return 'failed';
            if (json.type === 'response.incomplete') return 'incomplete';
            return null;
        },
        extractDone(json) {
            return json.type === 'response.completed' || json.type === 'response.failed' ||
                   json.type === 'response.incomplete';
        },
        extractUsage(json) {
            const u = json.response?.usage;
            return u ? { input: u.input_tokens ?? null, output: u.output_tokens ?? null, total: u.total_tokens ?? null } : null;
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
        wire: 'sse',
        chatPath: '/v1/messages',
        modelsPath: '/v1/models',
        modelsArrayKey: 'data',
        modelsIdField: 'id',
        modelsIdTransform: null,
        validFinishReasons: ['end_turn', 'max_tokens', 'stop_sequence'],
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
                const v = json.message?.usage?.input_tokens;
                return v != null ? { input: v } : null;
            }
            if (json.type === 'message_delta') {
                const v = json.usage?.output_tokens;
                return v != null ? { output: v } : null;
            }
            return null;
        }
    },

    // ── 4. Google Generative AI ────────────────────────────────────────────
    // POST /v1beta/models/{model}:streamGenerateContent?alt=sse · SSE · candidates[0].content.parts[0].text · query-key
    'google-generative-ai': {
        id: 'google-generative-ai',
        label: 'Google Generative AI',
        auth: { type: 'query-key' },
        authHeader: null,
        authVersion: null,
        wire: 'sse',  // alt=sse → standard SSE data: format
        chatPath: '/v1beta/models/{model}:streamGenerateContent',  // {model} placeholder
        modelsPath: '/v1beta/models',
        modelsArrayKey: 'models',
        modelsIdField: 'name',
        modelsIdTransform: name => name.replace('models/', ''),
        validFinishReasons: ['STOP', 'MAX_TOKENS'],
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
        extractDone(json) {
            return false;
        },
        extractUsage(json) {
            const u = json.usageMetadata;
            return u ? { input: u.promptTokenCount ?? null, output: u.candidatesTokenCount ?? null, total: u.totalTokenCount ?? null } : null;
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
        validFinishReasons: null,  // stream done = success
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
            return json.done ? (json.done_reason || 'stop') : null;
        },
        extractDone(json) {
            return json.done === true;
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
        validFinishReasons: null,
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
            return json.type === 'message-end' ? 'complete' : null;
        },
        extractDone(json) {
            return json.type === 'message-end';
        },
        extractUsage(json) {
            const u = json.usage?.tokens;
            return u ? { input: u.input_tokens ?? null, output: u.output_tokens ?? null, total: (u.input_tokens != null && u.output_tokens != null) ? u.input_tokens + u.output_tokens : null } : null;
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

// ── Smart URL completion ───────────────────────────────────────────────────
// Appends only the missing trailing portion of fullPath that the user hasn't already typed.
// Examples (fullPath = "/v1/chat/completions"):
//   "http://127.0.0.1:18080"          → "http://127.0.0.1:18080/v1/chat/completions"
//   "http://127.0.0.1:18080/v1"       → "http://127.0.0.1:18080/v1/chat/completions"
//   "http://127.0.0.1:18080/v1/chat"  → "http://127.0.0.1:18080/v1/chat/completions"
//   "http://127.0.0.1:18080/v1/chat/completions" → unchanged
//   "http://127.0.0.1:18080/v1/"      → strip trailing slash first, then complete
function smartCompleteUrl(baseUrl, fullPath) {
    let base = (baseUrl || '').trim();
    while (base.endsWith('/')) base = base.slice(0, -1);
    // If base already ends with fullPath → no completion needed
    if (base.endsWith(fullPath)) return base;
    // Find the longest prefix of fullPath that is a suffix of base, then append the rest.
    // Iterate from longest to shortest prefix for maximum reuse.
    for (let i = fullPath.length - 1; i >= 1; i--) {
        const candidate = fullPath.slice(0, i);
        // candidate always starts with '/' (fullPath does), so endsWith is sufficient
        // — the leading '/' ensures we match at a path-segment boundary.
        if (candidate && base.endsWith(candidate)) {
            return base + fullPath.slice(i);
        }
    }
    // No overlap — append full path
    return base + fullPath;
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
    }

    getChatPath() {
        return this.spec.chatPath;
    }

    getModelsPath() {
        return this.spec.modelsPath;
    }

    // Build the chat request { url, headers, body } for a model+prompt
    buildChatRequest(model, prompt) {
        const spec = this.spec;
        const chatPath = this.getChatPath();
        let url;
        if (spec.id === 'google-generative-ai') {
            // Google: embed model + key + alt=sse into the URL path/query
            const pathWithModel = chatPath.replace('{model}', encodeURIComponent(model));
            url = smartCompleteUrl(this.baseUrl, pathWithModel) + `?key=${encodeURIComponent(this.apiKey)}&alt=sse`;
        } else {
            url = smartCompleteUrl(this.baseUrl, chatPath);
        }

        const headers = { 'Content-Type': 'application/json' };

        switch (spec.auth.type) {
            case 'bearer':
                headers['Authorization'] = `Bearer ${this.apiKey}`;
                break;
            case 'x-api-key':
                headers[spec.authHeader] = this.apiKey;
                if (spec.authVersion) {
                    headers['anthropic-version'] = spec.authVersion;
                }
                break;
            case 'query-key':
                // key is in URL (handled above for google)
                break;
            case 'none':
                // Ollama: no auth by default, but support Bearer for remote instances
                if (this.apiKey && this.apiKey.trim()) {
                    headers['Authorization'] = `Bearer ${this.apiKey}`;
                }
                break;
        }

        const body = spec.buildBody(model, prompt, this.options);
        return { url, headers, body };
    }

    // Fetch model list → string[]
    async fetchModels(signal) {
        const spec = this.spec;
        const modelsPath = this.getModelsPath();
        let url;
        if (spec.id === 'google-generative-ai') {
            url = smartCompleteUrl(this.baseUrl, modelsPath) + `?key=${encodeURIComponent(this.apiKey)}`;
        } else {
            url = smartCompleteUrl(this.baseUrl, modelsPath);
        }

        const headers = { 'Content-Type': 'application/json' };
        switch (spec.auth.type) {
            case 'bearer':
                headers['Authorization'] = `Bearer ${this.apiKey}`;
                break;
            case 'x-api-key':
                headers[spec.authHeader] = this.apiKey;
                if (spec.authVersion) {
                    headers['anthropic-version'] = spec.authVersion;
                }
                break;
            case 'none':
                if (this.apiKey && this.apiKey.trim()) {
                    headers['Authorization'] = `Bearer ${this.apiKey}`;
                }
                break;
        }

        // GET is idempotent — retry transient failures (network errors / 5xx,
        // e.g. an origin hiccup behind a CDN) up to 3 times with backoff.
        const MAX_ATTEMPTS = 3;
        let response = null, fetchErr = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (signal && signal.aborted) break;
            fetchErr = null;
            try {
                response = await fetch(url, { method: 'GET', headers, signal });
                if (!response.ok && response.status < 500) break;   // 4xx fails fast
            } catch (err) {
                fetchErr = err;
            }
            if ((fetchErr || (response && response.status >= 500)) && attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 800 * attempt));
            }
        }
        if (fetchErr) throw fetchErr;
        if (!response || !response.ok) {
            const status = response ? response.status : 599;
            const errorData = response ? await response.text() : '';
            throw new Error(`HTTP ${status}: ${sanitizeErrorBody(errorData)}`);
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
        try {
            const { url, headers, body } = this.buildChatRequest(model, prompt);
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`HTTP ${response.status}: ${sanitizeErrorBody(errorData)}`);
            }

            const streamResult = await this.processStream(response, startTime, onProgress, signal);
            streamResult.usage = streamResult.usage || null;
            streamResult.inputTokens = streamResult.usage?.input ?? this.estimateTokens(prompt);
            if (streamResult.usage?.output != null) streamResult.totalTokens = streamResult.usage.output;
            return streamResult;
        } catch (err) {
            if (err.name === 'AbortError') {
                const errorResult = {
                    firstTokenTime: null,
                    outputSpeed: '0.00',
                    totalTokens: 0,
                    totalLatency: Date.now() - startTime,
                    result: '',
                    error: 'Cancelled',
                    status: 'failed'
                };
                if (onProgress) onProgress(errorResult);
                return errorResult;
            }
            const errorResult = {
                firstTokenTime: null,
                outputSpeed: '0.00',
                totalTokens: 0,
                totalLatency: Date.now() - startTime,
                result: '',
                error: err.message,
                status: 'failed'
            };
            if (onProgress) onProgress(errorResult);
            return errorResult;
        }
    }

    // Unified stream processor for sse + ndjson
    async processStream(response, startTime, onProgress, signal) {
        const spec = this.spec;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let firstTokenTime = null;
        let totalTokens = 0;
        let result = '';
        let buffer = '';
        let finishReason = null;
        const tokenTimes = [];   // per-chunk elapsed ms — basis for ITL metrics
        let usage = null;   // provider-reported token usage, when the stream provides it

        try {
            while (true) {
                if (signal && signal.aborted) break;
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    let raw = line;
                    if (spec.wire === 'sse') {
                        // SSE: only parse lines with "data: " prefix
                        if (!line.startsWith('data: ')) continue;
                        raw = line.slice(6);
                        if (raw === '[DONE]') continue;
                    } else {
                        // ndjson: skip empty lines
                        if (!raw.trim()) continue;
                    }

                    let parsed;
                    try {
                        parsed = JSON.parse(raw);
                    } catch (e) {
                        continue;  // skip invalid JSON
                    }

                    const u = spec.extractUsage ? spec.extractUsage(parsed) : null;
                    if (u) {
                        usage = usage || {};
                        if (u.input != null) usage.input = u.input;
                        if (u.output != null) usage.output = u.output;
                        if (u.total != null) usage.total = u.total;
                    }
                    const content = spec.extractDelta(parsed);
                    const currentFinish = spec.extractFinishReason(parsed);
                    if (currentFinish) finishReason = currentFinish;

                    // Some providers signal done via a field (e.g. ollama done:true)
                    const streamDone = spec.extractDone(parsed);

                    if (content) {
                        if (firstTokenTime === null) {
                            firstTokenTime = Date.now() - startTime;
                        }
                        tokenTimes.push(Date.now() - startTime);
                        result += content;
                        totalTokens += this.estimateTokens(content);

                        const outputSpeed = totalTokens / ((Date.now() - startTime) / 1000);
                        if (onProgress) {
                            onProgress({
                                firstTokenTime,
                                outputSpeed: outputSpeed.toFixed(2),
                                totalTokens,
                                result,
                                error: null,
                                status: 'testing'
                            });
                        }
                    }

                    if (streamDone) {
                        const totalTime = (Date.now() - startTime) / 1000;
                        const finalOutputSpeed = totalTokens / totalTime;
                        // Empty response (no content received) = failure
                        const isEmpty = !result || result.trim().length === 0;
                        return {
                            firstTokenTime,
                            outputSpeed: finalOutputSpeed.toFixed(2),
                            totalTokens,
                            totalLatency: Date.now() - startTime,
                            usage,
                            tokenTimes,
                            finishReason,
                            result,
                            error: isEmpty ? 'Empty response (no content received)' : null,
                            status: isEmpty ? 'failed' : 'completed'
                        };
                    }
                }
            }

            const totalTime = (Date.now() - startTime) / 1000;
            const finalOutputSpeed = totalTokens / totalTime;
            // Validate finish reason if the spec defines valid ones
            let isSuccess = true;
            let error = null;
            if (spec.validFinishReasons !== null) {
                isSuccess = spec.validFinishReasons.includes(finishReason);
                if (!isSuccess) {
                    error = `Invalid finish_reason: ${finishReason || 'missing'}`;
                }
            }
            // Empty response (no content received) = failure
            if (!result || result.trim().length === 0) {
                isSuccess = false;
                error = 'Empty response (no content received)';
            }
            const status = isSuccess ? 'completed' : 'failed';
            return {
                firstTokenTime,
                outputSpeed: finalOutputSpeed.toFixed(2),
                totalTokens,
                totalLatency: Date.now() - startTime,
                usage,
                tokenTimes,
                finishReason,
                result,
                error,
                status
            };
        } finally {
            reader.releaseLock();
        }
    }

    // CJK-aware token estimation
    estimateTokens(text) {
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
        return Math.ceil(tokens);
    }

    // ── Static helpers ─────────────────────────────────────────────────────
    static smartCompleteUrl(baseUrl, fullPath) {
        return smartCompleteUrl(baseUrl, fullPath);
    }

    static getProtocol(protocol) {
        return PROTOCOLS[protocol] || null;
    }
    static getDefaultBaseUrl(protocol) {
        return PROTOCOL_DEFAULTS[protocol] || '';
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

        if (!spec) {
            errors.push('Unsupported protocol');
        }

        if (!baseUrl || !this.isValidUrl(baseUrl)) {
            errors.push('Valid API Base URL is required');
        }

        // Ollama with none auth doesn't need a key; others do
        if (spec && spec.auth.type !== 'none') {
            if (!apiKey || apiKey.trim().length === 0) {
                errors.push('API Key is required');
            }
        }

        if (!models || models.length === 0) {
            errors.push('At least one model is required');
        }

        if (!prompts || prompts.length === 0) {
            errors.push('At least one prompt is required');
        }

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
