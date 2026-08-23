// Main application logic — multi-target concurrent testing
class APITester {
    constructor() {
        this.isRunning = false;
        this.testResults = [];
        this.currentTestId = null;
        this.abortController = null;
        this.targetCounter = 0;
        this.activeFetchTarget = null;  // which target's "Fetch Models" was clicked
        this.totalPlanned = 0;
        this.completedCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedConfig();
        this.renderHistoryRecords();
        // Always ensure at least one target row
        if (document.querySelectorAll('.target-row').length === 0) {
            this.addTargetRow();
        }
    }

    setupEventListeners() {
        // Start / Stop test buttons
        document.getElementById('startTest')?.addEventListener('click', () => this.startTests());
        document.getElementById('stopTest')?.addEventListener('click', () => this.stopTests());

        // Add target button
        document.getElementById('addTarget')?.addEventListener('click', () => this.addTargetRow());

        // Model picker controls (shared)
        document.getElementById('modelPickerSearch')?.addEventListener('input', (e) => this.filterModelPicker(e.target.value));
        document.getElementById('selectAllModels')?.addEventListener('click', () => this.toggleAllModels(true));
        document.getElementById('deselectAllModels')?.addEventListener('click', () => this.toggleAllModels(false));
        document.getElementById('useSelectedModels')?.addEventListener('click', () => this.applySelectedModels());
        document.getElementById('closeModelPicker')?.addEventListener('click', () => this.closeModelPicker());
        // Click backdrop to close model picker
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) this.closeModelPicker();
        });

        // Export buttons
        document.getElementById('exportCsv')?.addEventListener('click', () => this.exportResults('csv'));
        document.getElementById('exportJson')?.addEventListener('click', () => this.exportResults('json'));
        document.getElementById('exportStatistics')?.addEventListener('click', () => this.exportStatistics());

        // Result search filter
        document.getElementById('resultSearch')?.addEventListener('input', (e) => this.filterResults(e.target.value));


        // Save config on input changes — global fields (not per-target)
        ['prompts', 'rounds', 'maxTokens', 'temperature', 'topP', 'systemPrompt', 'concurrency', 'modelPrices'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.saveConfig());
                el.addEventListener('change', () => this.saveConfig());
            }
        });

        // Result cell / view-result delegation
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('result-cell') && !e.target.classList.contains('result-cell-btn-wrap')) {
                this.toggleResultExpansion(e.target);
            }
            if (e.target.classList.contains('view-result-btn')) {
                const testRow = e.target.closest('tr');
                if (testRow && testRow.id) this.handleViewResultClick(e, testRow.id);
            }
        });


        // History controls
        document.getElementById('clearHistoryBtn')?.addEventListener('click', () => this.confirmClearHistory());

        // Real-time viewer controls
        document.getElementById('closeViewer')?.addEventListener('click', () => this.hideRealtimeViewer());
        document.getElementById('closeDetailViewer')?.addEventListener('click', () => this.hideResultDetailViewer());

        this.isViewerVisible = false;
        this.isDetailViewerVisible = false;
    }

    // ── Target row management ────────────────────────────────────────────────
    addTargetRow(data) {
        const id = ++this.targetCounter;
        const list = document.getElementById('targetList');
        if (!list) return;

        const row = document.createElement('div');
        row.className = 'target-row';
        row.dataset.targetId = id;

        const protocol = data?.protocol || 'openai-chat-completions';
        const apiUrl = data?.apiUrl || '';
        const apiKey = data?.apiKey || '';
        const models = data?.models || '';

        const canDelete = list.children.length >= 1;

        row.innerHTML = `
            <div class="target-row-header">
                <span class="target-label">#${list.children.length + 1}</span>
                <div class="target-header-actions">
                    <button type="button" class="btn-toggle-target" title="${i18n.t('disableTarget')}">${i18n.t('disableTarget')}</button>
                    <button type="button" class="btn-remove-target" title="${i18n.t('removeTarget')}" ${canDelete ? '' : 'disabled'}>✕</button>
                </div>
            </div>
            <div class="target-collapsed-summary" aria-hidden="true"></div>
            <div class="target-fields">
                <div class="target-field">
                    <label data-i18n="targetProtocol">Protocol</label>
                    <select class="target-protocol">
                        <option value="openai-chat-completions">OpenAI Chat Completions</option>
                        <option value="openai-responses">OpenAI Responses</option>
                        <option value="anthropic-messages">Anthropic Messages</option>
                        <option value="google-generative-ai">Google Generative AI</option>
                        <option value="ollama-chat">Ollama Chat</option>
                        <option value="cohere-chat">Cohere Chat</option>
                    </select>
                </div>
                <div class="target-field">
                    <label data-i18n="targetApiUrl">Base URL</label>
                    <input type="url" class="target-apiurl" placeholder="https://api.openai.com">
                    <div class="chat-url-preview"></div>
                </div>
                <div class="target-field">
                    <label data-i18n="targetApiKey">API Key</label>
                    <div class="api-key-wrapper">
                        <input type="password" class="target-apikey" placeholder="sk-...">
                        <button type="button" class="toggle-key-btn" title="${i18n.t('toggleApiKey')}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                </div>
                <div class="target-field target-field-models">
                    <div class="target-models-header">
                        <label data-i18n="targetModels">Models (one per line)</label>
                        <button type="button" class="fetch-models-btn" data-i18n="fetchModels">Fetch Models</button>
                    </div>
                    <textarea class="target-models" rows="2" placeholder="gpt-3.5-turbo"></textarea>
                </div>
            </div>
        `;

        // Set values
        row.querySelector('.target-protocol').value = protocol;
        row.querySelector('.target-apiurl').value = apiUrl;
        row.querySelector('.target-apikey').value = apiKey;
        row.querySelector('.target-models').value = models;

        // Restore disabled (collapsed) state if persisted
        if (data?.enabled === false) this.setTargetDisabled(row, true);

        // Wire events for this row
        this.wireTargetRow(row);
        list.appendChild(row);

        // Trigger initial URL completion + preview
        this.completeTargetUrl(row);
        this.updateTargetPreview(row);

        // Update all target labels (sequential numbering)
        this.updateTargetLabels();

        // Enable all remove buttons now that there's >1
        if (list.children.length > 1) {
            list.querySelectorAll('.btn-remove-target').forEach(b => b.disabled = false);
        }

        this.saveConfig();
    }

    wireTargetRow(row) {
        const protocolSel = row.querySelector('.target-protocol');
        const apiUrlInput = row.querySelector('.target-apiurl');
        const apiKeyInput = row.querySelector('.target-apikey');
        const modelsTextarea = row.querySelector('.target-models');
        const removeBtn = row.querySelector('.btn-remove-target');
        const toggleKeyBtn = row.querySelector('.toggle-key-btn');
        const fetchBtn = row.querySelector('.fetch-models-btn');

        // Protocol change → URL completion + preview
        protocolSel.addEventListener('change', () => {
            this.completeTargetUrl(row);
            this.updateTargetPreview(row);
            this.saveConfig();
        });

        // URL input → preview + save
        apiUrlInput.addEventListener('input', () => {
            this.updateTargetPreview(row);
            this.saveConfig();
        });

        // Key/models changes → save
        apiKeyInput.addEventListener('input', () => this.saveConfig());
        modelsTextarea.addEventListener('input', () => this.saveConfig());

        // Disable/enable (collapse) target
        const toggleBtn = row.querySelector('.btn-toggle-target');
        toggleBtn.addEventListener('click', () => {
            this.setTargetDisabled(row, !row.classList.contains('target-disabled'));
            this.saveConfig();
        });

        // Remove target
        removeBtn.addEventListener('click', () => this.removeTargetRow(row));

        // Key visibility toggle (per-row)
        toggleKeyBtn.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleKeyBtn.innerHTML = this.eyeOffSvg();
            } else {
                apiKeyInput.type = 'password';
                toggleKeyBtn.innerHTML = this.eyeOnSvg();
            }
        });

        // Fetch models for this target
        fetchBtn.addEventListener('click', () => {
            this.activeFetchTarget = row;
            this.fetchModels(row);
        });
    }

    removeTargetRow(row) {
        const list = document.getElementById('targetList');
        if (list.children.length <= 1) return;  // keep at least one
        row.remove();
        this.updateTargetLabels();
        // If only one left, disable its remove button
        if (list.children.length === 1) {
            list.querySelector('.btn-remove-target').disabled = true;
        }
        this.saveConfig();
    }

    // Enable/disable a target: disabled rows collapse and are skipped in tests
    setTargetDisabled(row, disabled) {
        row.classList.toggle('target-disabled', disabled);
        const btn = row.querySelector('.btn-toggle-target');
        if (btn) {
            btn.textContent = i18n.t(disabled ? 'enableTarget' : 'disableTarget');
            btn.title = i18n.t(disabled ? 'enableTarget' : 'disableTarget');
        }
        // Collapsed rows show their base URL so channels remain identifiable
        if (disabled) {
            const summary = row.querySelector('.target-collapsed-summary');
            if (summary) summary.textContent = row.querySelector('.target-apiurl')?.value?.trim() || '—';
        }
    }

    updateTargetLabels() {
        document.querySelectorAll('.target-row').forEach((row, i) => {
            const label = row.querySelector('.target-label');
            if (label) label.textContent = `#${i + 1}`;
        });
    }

    // ── URL smart completion per target ───────────────────────────────────
    completeTargetUrl(row) {
        const protocolSel = row.querySelector('.target-protocol');
        const apiUrlInput = row.querySelector('.target-apiurl');
        const protocol = protocolSel.value;
        const defaultBase = APIHandler.getDefaultBaseUrl(protocol);
        apiUrlInput.placeholder = defaultBase;

        const currentVal = apiUrlInput.value.trim();
        const allDefaults = APIHandler.getAllDefaultBaseUrls();
        const allChatUrls = APIHandler.getAllChatUrls();

        // If empty or a known default → replace; otherwise preserve custom URL
        if (!currentVal || allDefaults.has(currentVal) || allChatUrls.has(currentVal)) {
            apiUrlInput.value = defaultBase;
        }
    }

    updateTargetPreview(row) {
        const preview = row.querySelector('.chat-url-preview');
        if (!preview) return;

        const protocol = row.querySelector('.target-protocol')?.value;
        const baseUrl = row.querySelector('.target-apiurl')?.value;
        const spec = APIHandler.getProtocol(protocol);
        if (!spec) {
            preview.textContent = '';
            return;
        }

        const chatPath = spec.chatPath;
        let url;
        if (spec.id === 'google-generative-ai') {
            const pathWithModel = chatPath.replace('{model}', '{model}');
            url = APIHandler.smartCompleteUrl(baseUrl, pathWithModel) + '?key=...&alt=sse';
        } else {
            url = APIHandler.smartCompleteUrl(baseUrl, chatPath);
        }
        preview.textContent = url;
    }

    // ── SVG helpers ─────────────────────────────────────────────────────────
    eyeOnSvg() {
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
    eyeOffSvg() {
        return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    }

    // ── Model fetching (per target) ────────────────────────────────────────
    async fetchModels(row) {
        const target = this.getTargetData(row);
        const fetchBtn = row.querySelector('.fetch-models-btn');
        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = i18n.t('fetchingModels');
        }

        try {
            const handler = new APIHandler(target.protocol, target.apiUrl, target.apiKey);
            const models = await handler.fetchModels();
            if (models.length === 0) {
                this.showNotification(i18n.t('noModelsFetched'));
                return;
            }
            this.openModelPicker(models);
            this.showNotification(i18n.t('fetchModelsSuccess') + ` (${models.length})`);
        } catch (error) {
            this.showNotification(i18n.t('fetchModelsFailed') + ': ' + error.message);
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = i18n.t('fetchModels');
            }
        }
    }

    openModelPicker(models) {
        const picker = document.getElementById('modelPicker');
        const list = document.getElementById('modelPickerList');
        if (!picker || !list) return;

        list.innerHTML = models.map(m => `
            <label class="model-picker-item">
                <input type="checkbox" value="${this.escapeHtml(m)}">
                <span>${this.escapeHtml(m)}</span>
            </label>
        `).join('');

        picker.classList.remove('hidden');
        // Backdrop overlay (created first so picker sits above in DOM order)
        let backdrop = document.querySelector('.modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';
            document.body.appendChild(backdrop);
        }
        // Move picker to body root so it escapes config-section's stacking context
        if (picker.parentNode !== document.body) document.body.appendChild(picker);
        const search = document.getElementById('modelPickerSearch');
        if (search) { search.value = ''; search.focus(); }
    }

    closeModelPicker() {
        document.getElementById('modelPicker')?.classList.add('hidden');
        document.querySelector('.modal-backdrop')?.remove();
    }

    filterModelPicker(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.model-picker-item').forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    }

    toggleAllModels(checked) {
        document.querySelectorAll('#modelPickerList input[type="checkbox"]').forEach(cb => {
            cb.checked = checked;
        });
    }

    applySelectedModels() {
        const selected = Array.from(document.querySelectorAll('#modelPickerList input[type="checkbox"]:checked')).map(cb => cb.value);
        if (this.activeFetchTarget && selected.length > 0) {
            const modelsInput = this.activeFetchTarget.querySelector('.target-models');
            // Overwrite textarea with the picked selection (deduplicated)
            modelsInput.value = [...new Set(selected)].join('\n');
            this.saveConfig();
        }
        this.closeModelPicker();
    }

    // ── Config: read all targets ───────────────────────────────────────────
    getTargetData(row) {
        return {
            enabled: !row.classList.contains('target-disabled'),
            protocol: row.querySelector('.target-protocol')?.value || 'openai-chat-completions',
            apiUrl: (row.querySelector('.target-apiurl')?.value || '').trim(),
            apiKey: (row.querySelector('.target-apikey')?.value || '').trim(),
            models: (row.querySelector('.target-models')?.value || '').trim().split('\n').filter(m => m.trim())
        };
    }

    getAllTargets() {
        return Array.from(document.querySelectorAll('.target-row')).map(row => this.getTargetData(row));
    }

    getConfig() {
        const get = (id) => document.getElementById(id)?.value ?? '';
        return {
            targets: this.getAllTargets(),
            prompts: get('prompts').trim().split('\n').filter(p => p.trim()),
            rounds: parseInt(get('rounds')) || 1,
            maxTokens: parseInt(get('maxTokens')) || 1000,
            temperature: parseFloat(get('temperature')) || 0.7,
            topP: parseFloat(get('topP')) || 1,
            concurrency: parseInt(get('concurrency')) || 1
        };
    }

    // Build a short label for a target (for results table)
    targetLabel(target) {
        const spec = APIHandler.getProtocol(target.protocol);
        const proto = spec ? spec.label : target.protocol;
        // Extract host from URL for brevity
        let host = target.apiUrl;
        try { host = new URL(target.apiUrl).host; } catch (_) {}
        return `${proto} @ ${host}`;
    }

    validateConfig(config) {
        const errors = [];
        if (!config.targets || config.targets.length === 0) {
            errors.push('At least one test target is required');
        }
        const enabledTargets = (config.targets || []).filter(t => t.enabled !== false);
        if (config.targets && config.targets.length > 0 && enabledTargets.length === 0) {
            errors.push('All targets are disabled — enable at least one target to run a test');
        }
        for (let i = 0; i < config.targets.length; i++) {
            const t = config.targets[i];
            if (t.enabled === false) continue; // skip disabled targets
            if (!t.apiUrl) errors.push(`Target #${i + 1}: Base URL is required`);
            if (t.models.length === 0) errors.push(`Target #${i + 1}: At least one model is required`);
            const spec = APIHandler.getProtocol(t.protocol);
            if (spec && spec.auth.type !== 'none' && !t.apiKey) {
                errors.push(`Target #${i + 1}: API Key is required for this protocol`);
            }
        }
        if (!config.prompts || config.prompts.length === 0) {
            errors.push('At least one prompt is required');
        }
        return errors;
    }

    // ── Config persistence ──────────────────────────────────────────────────
    loadSavedConfig() {
        try {
            const saved = localStorage.getItem('apiTesterConfig');
            if (saved) {
                const config = JSON.parse(saved);
                // Restore global fields
                ['prompts', 'rounds', 'maxTokens', 'temperature', 'topP', 'systemPrompt', 'concurrency', 'modelPrices'].forEach(key => {
                    const el = document.getElementById(key);
                    if (el && config[key] !== undefined && config[key] !== null) el.value = config[key];
                });
                // Restore targets
                if (config.targets && config.targets.length > 0) {
                    config.targets.forEach(t => this.addTargetRow(t));
                    // Remove the default empty row that init() may have created
                    const rows = document.querySelectorAll('.target-row');
                    if (rows.length > config.targets.length) {
                        rows[rows.length - 1].remove();
                        this.updateTargetLabels();
                    }
                }
            }

            // Default prompts
            const promptsEl = document.getElementById('prompts');
            if (promptsEl && (!promptsEl.value || promptsEl.value.trim() === '')) {
                promptsEl.value = [
                    'Explain the concept of "quantum entanglement" to a high school student, including its potential applications.',
                    'Discuss the primary ethical challenges posed by the rapid development of autonomous vehicles.',
                    'Write a short story about a sentient AI that discovers a hidden message within the internet\'s oldest data archives.'
                ].join('\n');
            }
        } catch (e) {
            console.warn('Failed to load saved config:', e);
        }
    }

    saveConfig() {
        try {
            const config = {
                targets: this.getAllTargets(),
                prompts: document.getElementById('prompts')?.value || '',
                rounds: document.getElementById('rounds')?.value || '1',
                maxTokens: document.getElementById('maxTokens')?.value || '1000',
                temperature: document.getElementById('temperature')?.value || '0.7',
                topP: document.getElementById('topP')?.value || '1',
                systemPrompt: document.getElementById('systemPrompt')?.value || '',
                concurrency: document.getElementById('concurrency')?.value || '1',
                modelPrices: document.getElementById('modelPrices')?.value || ''
            };
            localStorage.setItem('apiTesterConfig', JSON.stringify(config));
        } catch (e) {
            console.warn('Failed to save config:', e);
        }
    }

    // ── Concurrent test pool + stop ──────────────────────────────────────────
    async startTests() {
        if (this.isRunning) return;

        const config = this.getConfig();
        const errors = this.validateConfig(config);
        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }

        this.isRunning = true;
        this.abortController = new AbortController();
        this.updateStartButton(true);
        this.updateStopButton(true);
        this.disableAllResultButtons();
        this.clearResults();

        try {
            await this.runTests(config);
            if (this.isRunning) this.showNotification(i18n.t('testCompleted'));
        } catch (error) {
            console.error('Test execution failed:', error);
            this.showNotification(i18n.t('testFailed') + ': ' + error.message);
        } finally {
            this.isRunning = false;
            this.abortController = null;
            this.updateStartButton(false);
            this.updateStopButton(false);
            this.enableCompletedResultButtons();
            this.generateStatistics();
        }
    }

    stopTests() {
        if (this.abortController) this.abortController.abort();
        this.isRunning = false;
    }

    async runTests(config) {
        // Build all tasks: targets × models × prompts × rounds
        const tasks = [];
        for (let ti = 0; ti < config.targets.length; ti++) {
            const target = config.targets[ti];
            if (target.enabled === false) continue; // skip disabled targets
            const label = this.targetLabel(target);
            const handler = new APIHandler(target.protocol, target.apiUrl, target.apiKey, {
                maxTokens: config.maxTokens,
                temperature: config.temperature,
                topP: config.topP,
                systemPrompt: config.systemPrompt
            });
            for (const model of target.models) {
                for (const prompt of config.prompts) {
                    for (let round = 1; round <= config.rounds; round++) {
                        tasks.push({ handler, model, prompt, round, label });
                    }
                }
            }
        }

        this.totalPlanned = tasks.length;
        this.completedCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        const dash = document.getElementById('dashboardSection');
        if (dash) dash.style.display = '';
        this.updateDashboard();

        let taskIndex = 0;
        const concurrency = Math.max(1, Math.min(config.concurrency || 1, 10));
        const workers = [];
        for (let i = 0; i < concurrency; i++) {
            workers.push(this.runWorker(tasks, () => taskIndex++, this.abortController.signal));
        }
        await Promise.all(workers);
    }

    async runWorker(tasks, nextIndex, signal) {
        while (this.isRunning && !signal.aborted) {
            const idx = nextIndex();
            if (idx >= tasks.length) break;
            const { handler, model, prompt, round, label } = tasks[idx];
            const testId = this.addTestRow(model, label, prompt, round);

            try {
                const result = await handler.testModel(model, prompt, (progress) => {
                    this.updateTestRow(testId, progress);
                }, signal);
                if (result && (result.status === 'failed' || result.status === 'completed')) {
                    this.updateTestRow(testId, result);
                    this.completedCount++;
                    if (result.status === 'completed' && !result.error) this.successCount++;
                    else this.failedCount++;
                    this.updateDashboard();
                }
            } catch (error) {
                this.updateTestRow(testId, {
                    firstTokenTime: null, outputSpeed: '0.00', result: '', error: error.message, status: 'failed'
                });
                this.completedCount++;
                this.failedCount++;
                this.updateDashboard();
            }
        }
    }

    updateDashboard() {
        document.getElementById('dashTotal').textContent = this.completedCount;
        document.getElementById('dashSuccess').textContent = this.successCount;
        document.getElementById('dashFailed').textContent = this.failedCount;
        document.getElementById('dashProgress').textContent =
            this.totalPlanned > 0 ? Math.round(this.completedCount / this.totalPlanned * 100) + '%' : '0%';
    }

    addTestRow(model, targetLabel, prompt, round) {
        const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tbody = document.getElementById('resultsBody');
        const row = document.createElement('tr');
        row.id = testId;
        row.dataset.model = model;
        row.dataset.target = targetLabel;
        row.dataset.prompt = prompt;
        row.dataset.round = round;
        row.innerHTML = `
            <td>${this.escapeHtml(model)}</td>
            <td class="target-cell" title="${this.escapeHtml(targetLabel)}">${this.truncateText(targetLabel, 40)}</td>
            <td class="result-cell" title="${this.escapeHtml(prompt)}">${this.truncateText(prompt, 50)}</td>
            <td>${round}</td>
            <td class="first-token">-</td>
            <td class="output-speed">-</td>
            <td class="result-cell result-cell-btn-wrap"><button class="view-result-btn" data-test-id="${testId}" disabled>-</button></td>
            <td class="error-cell">-</td>
            <td class="status-cell"><span class="status-dot pulse"></span> ${i18n.t('testing')}</td>
        `;
        tbody.appendChild(row);
        return testId;
    }

    updateTestRow(testId, data) {
        const row = document.getElementById(testId);
        if (!row) return;

        if (data.status === 'completed' || data.status === 'failed' || data.error) {
            const model = row.dataset.model;
            const target = row.dataset.target || '';
            const prompt = row.dataset.prompt;
            const round = parseInt(row.dataset.round);
            const resultData = {
                testId, model, target, prompt, round,
                firstTokenTime: data.firstTokenTime,
                outputSpeed: parseFloat(data.outputSpeed) || 0,
                totalTokens: data.totalTokens || 0,
                totalLatency: data.totalLatency ?? null,
                tokenTimes: Array.isArray(data.tokenTimes) ? data.tokenTimes : null,
                finishReason: data.finishReason ?? null,
                inputTokens: data.inputTokens ?? null,
                tpot: this.computeTpot(data.totalLatency, data.firstTokenTime, data.totalTokens),
                usage: data.usage ?? null,
                errorType: data.error ? this.classifyError(data.error) : null,
                result: data.result || '',
                error: data.error || null,
                status: data.status || (data.error ? 'failed' : 'completed')
            };
            const idx = this.testResults.findIndex(r => r.testId === testId);
            if (idx >= 0) this.testResults[idx] = resultData;
            else this.testResults.push(resultData);
        }

        const ftCell = row.querySelector('.first-token');
        const osCell = row.querySelector('.output-speed');
        const rCell = row.querySelector('.result-cell-btn-wrap');
        const eCell = row.querySelector('.error-cell');
        const sCell = row.querySelector('.status-cell');

        if (data.firstTokenTime !== null && data.firstTokenTime !== undefined) ftCell.textContent = data.firstTokenTime + 'ms';
        if (data.outputSpeed) osCell.textContent = data.outputSpeed;

        const btn = rCell?.querySelector('.view-result-btn');
        if (btn) {
            if (data.status === 'testing') {
                // 流式进行中：按钮 = 实时查看（点击把查看器钉到该请求）
                btn.textContent = i18n.t('realtimeView');
                btn.disabled = false;
                btn.dataset.live = '1';
                btn.dataset.fullText = data.result || '';
                btn.title = i18n.t('clickToViewProgress');
                btn.classList.add('live-state');
                btn.classList.remove('error-state');
            } else if (data.result) {
                // 已结束：按钮 = 查看结果（打开详情查看器）
                btn.textContent = i18n.t('viewResult');
                btn.disabled = this.isRunning;
                btn.dataset.live = '';
                btn.dataset.fullText = data.result;
                btn.title = i18n.t('clickToViewInViewer');
                btn.classList.remove('live-state');
            }
        }

        if (data.error) {
            eCell.textContent = data.error;
            eCell.title = data.error;
            if (btn && !data.result) {
                btn.textContent = i18n.t('error');
                btn.disabled = true;
                btn.dataset.live = '';
                btn.classList.remove('live-state');
                btn.classList.add('error-state');
            }
        }

        let cls = '', txt = '';
        switch (data.status) {
            case 'testing':  cls = 'status-testing';   txt = `<span class="status-dot pulse"></span> ${i18n.t('testing')}`; break;
            case 'completed': cls = 'status-completed'; txt = `✓ ${i18n.t('completed')}`; break;
            case 'failed':   cls = 'status-failed';    txt = `✗ ${i18n.t('failed')}`; break;
        }
        sCell.className = `status-cell ${cls}`;
        sCell.innerHTML = txt;

        if (testId === this.currentTestId) {
            this.updateRealtimeViewer(testId, row.dataset.model, row.dataset.prompt, row.dataset.round, data);
        }
    }

    toggleResultExpansion(cell) {
        const fullText = cell.dataset.fullText;
        if (!fullText) return;
        const isExpanded = cell.dataset.expanded === 'true';
        if (isExpanded) { cell.textContent = this.truncateText(fullText, 100); cell.dataset.expanded = 'false'; }
        else { cell.textContent = fullText; cell.dataset.expanded = 'true'; }
    }

    clearResults() {
        document.getElementById('resultsBody').innerHTML = '';
        this.currentTestId = null;
        this.hideRealtimeViewer();
        document.getElementById('statisticsSection')?.classList.add('hidden');
        document.getElementById('statisticsBody').innerHTML = '';
    }

    updateStartButton(running) {
        const btn = document.getElementById('startTest');
        if (btn) { btn.disabled = running; btn.textContent = running ? i18n.t('testing') : i18n.t('startTest'); }
    }
    updateStopButton(running) {
        const btn = document.getElementById('stopTest');
        if (btn) btn.style.display = running ? '' : 'none';
    }
    disableAllResultButtons() {
        document.querySelectorAll('.view-result-btn').forEach(b => { b.disabled = true; b.classList.add('testing-state'); });
    }
    enableCompletedResultButtons() {
        document.querySelectorAll('.view-result-btn').forEach(b => {
            if (b.dataset.fullText && b.dataset.fullText.trim()) {
                b.disabled = false;
                b.classList.remove('testing-state');
                b.textContent = i18n.t('viewResult');
                b.title = i18n.t('clickToViewInViewer');
            }
        });
    }

    showNotification(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        const progress = document.createElement('div');
        progress.className = 'toast-progress';
        toast.appendChild(progress);
        document.body.appendChild(toast);
        setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 3000);
    }

    truncateText(text, max) {
        return text.length <= max ? text : text.substring(0, max) + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Export ──────────────────────────────────────────────────────────────
    exportResults(format) {
        if (this.testResults.length === 0) { this.showNotification(i18n.t('noResultsToExport')); return; }
        if (format === 'json') {
            this.downloadBlob(new Blob([JSON.stringify(this.testResults, null, 2)], { type: 'application/json' }),
                `llm_speedtest_results_${new Date().toISOString().split('T')[0]}.json`);
            return;
        }
        const headers = [i18n.t('model'), i18n.t('target'), i18n.t('prompt'), i18n.t('round'), i18n.t('firstTokenTime'), i18n.t('totalLatency'), i18n.t('outputSpeed'), i18n.t('totalTokens'), i18n.t('result'), i18n.t('error'), i18n.t('errorType'), i18n.t('status')];
        const lines = [headers.join(',')];
        this.testResults.forEach(r => {
            lines.push([r.model, r.target, r.prompt, r.round, r.firstTokenTime || '', r.totalLatency || '', r.outputSpeed || '', r.totalTokens || '', r.result, r.error, r.errorType || '', r.status]
                .map(v => this.escapeCsv(v)).join(','));
        });
        this.downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }),
            `llm_speedtest_results_${new Date().toISOString().split('T')[0]}.csv`);
    }

    exportStatistics() {
        if (this.testResults.length === 0) { this.showNotification(i18n.t('noStatsToExport')); return; }
        const stats = this.computeStatistics();
        const headers = [i18n.t('model'), i18n.t('target'), i18n.t('averageFirstToken'), i18n.t('p50FirstToken'), i18n.t('p90FirstToken'), i18n.t('p95FirstToken'), i18n.t('p99FirstToken'),
            i18n.t('totalLatency'), i18n.t('averageOutputSpeed'), i18n.t('p50Speed'), i18n.t('p90Speed'), i18n.t('tpot'), i18n.t('itlP90'), i18n.t('inputTps'), i18n.t('totalTokens'), i18n.t('avgCost'),
            i18n.t('tokensPerDollar'), 'Max Output Tokens', i18n.t('avgInputTokens'), i18n.t('avgOutputTokens'), i18n.t('successRate'), i18n.t('errorRate')];
        const lines = [headers.join(',')];
        Object.keys(stats).forEach(key => {
            const s = stats[key];
            const g = this.aggregateGroup(s);
            const dist = Object.entries(g.errorDist).map(([k, v]) => `${i18n.t('err_' + k)}×${v}`).join(' ');
            lines.push([s.model, s.target,
                g.avgFirstToken !== null ? g.avgFirstToken.toFixed(2) : '',
                g.p50FirstToken ?? '', g.p90FirstToken ?? '', g.p95FirstToken ?? '', g.p99FirstToken ?? '',
                g.avgTotalLatency !== null ? g.avgTotalLatency.toFixed(2) : '',
                g.avgOutputSpeed !== null ? g.avgOutputSpeed.toFixed(2) : '',
                g.p50Speed ?? '', g.p90Speed ?? '',
                g.avgTpot !== null ? g.avgTpot.toFixed(2) : '',
                g.itlP90 ?? '', g.itlMax ?? '',
                g.avgPrefillTps !== null ? g.avgPrefillTps.toFixed(0) : '',
                s.totalTokens ?? '',
                g.avgCost !== null ? g.avgCost.toFixed(6) : '',
                g.tokensPerDollar !== null ? g.tokensPerDollar.toFixed(0) : '',
                g.maxOutputTokens ?? '',
                g.avgInputTokens !== null ? g.avgInputTokens.toFixed(0) : '',
                g.avgOutputTokens !== null ? g.avgOutputTokens.toFixed(0) : '',
                g.successRate.toFixed(1),
                (g.errorRate.toFixed(1) + '% ' + dist).trim()]
                .map(v => this.escapeCsv(v)).join(','));
        });
        this.downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }),
            `llm_speedtest_statistics_${new Date().toISOString().split('T')[0]}.csv`);
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    escapeCsv(text) {
        if (text === null || text === undefined) return '';
        if (typeof text !== 'string') return String(text);
        if (text.includes(',') || text.includes('"') || text.includes('\n')) return '"' + text.replace(/"/g, '""') + '"';
        return text;
    }

    // ── Result search filter ─────────────────────────────────────────────────
    filterResults(query) {
        const q = query.toLowerCase().trim();
        document.querySelectorAll('#resultsBody tr').forEach(row => {
            const model = (row.dataset.model || '').toLowerCase();
            const target = (row.dataset.target || '').toLowerCase();
            const prompt = (row.dataset.prompt || '').toLowerCase();
            row.style.display = (!q || model.includes(q) || target.includes(q) || prompt.includes(q)) ? '' : 'none';
        });
    }

    // ── Advanced statistics ──────────────────────────────────────────────────
    percentile(arr, p) {
        if (!arr || arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }

    // TPOT: ms per output token, excluding the first-token wait
    computeTpot(totalLatency, firstTokenTime, tokens) {
        if (!totalLatency || !firstTokenTime || !tokens || tokens < 2 || totalLatency <= firstTokenTime) return null;
        return (totalLatency - firstTokenTime) / (tokens - 1);
    }

    // Bucket an error message into a coarse, countable category
    classifyError(msg) {
        const m = String(msg || '');
        const st = m.match(/HTTP (\d{3})/);
        if (/abort|cancel/i.test(m) && !st) return 'cancelled';
        if (st) {
            const c = +st[1];
            if (c === 429) return 'rate_limit';
            if (c === 401) return 'unauthorized';
            if (c === 403) return 'forbidden';
            if (c === 400) return 'bad_request';
            if (c === 408) return 'timeout';
            if (c === 503) return 'service_unavailable';
            if (c >= 500) return 'server_error';
            return 'http_' + c;
        }
        if (/failed to fetch|networkerror|network error|err_connection|err_name|err_internet/i.test(m)) return 'network';
        if (/timed? ?out|timeout/i.test(m)) return 'timeout';
        return 'other';
    }

    // Model price table: "name=input,output" ($ per 1M tokens) per line
    parsePriceMap() {
        const map = {};
        (document.getElementById('modelPrices')?.value || '').split('\n').forEach(line => {
            const m = line.trim().match(/^(.+?)\s*=\s*([\d.]+)\s*,\s*([\d.]+)\s*$/);
            if (m) map[m[1].trim().toLowerCase()] = { input: parseFloat(m[2]), output: parseFloat(m[3]) };
        });
        return map;
    }

    // Per-request cost in USD; null when no price configured for the model
    computeCost(model, inputTokens, outputTokens) {
        const p = this.parsePriceMap()[String(model || '').toLowerCase()];
        if (!p) return null;
        return ((inputTokens || 0) / 1e6) * p.input + ((outputTokens || 0) / 1e6) * p.output;
    }

    computeStatistics() {
        // Key by model+target combination
        const stats = {};
        this.testResults.forEach(r => {
            const key = `${r.model}|||${r.target || ''}`;
            if (!stats[key]) {
                stats[key] = { model: r.model, target: r.target || '',
                    firstTokenTimes: [], outputSpeeds: [], totalLatencies: [], tpots: [], tokenTimesList: [],
                    costs: [], prefillTps: [], inputTokensArr: [], outputTokensArr: [],
                    totalTests: 0, successfulTests: 0, failedTests: 0, totalTokens: 0, errorTypes: {} };
            }
            const s = stats[key];
            s.totalTests++;
            if (r.status === 'completed' && !r.error) {
                s.successfulTests++;
                if (r.firstTokenTime && r.firstTokenTime > 0) s.firstTokenTimes.push(r.firstTokenTime);
                if (r.outputSpeed && r.outputSpeed > 0) s.outputSpeeds.push(r.outputSpeed);
                if (r.totalLatency && r.totalLatency > 0) s.totalLatencies.push(r.totalLatency);
                if (r.tpot && r.tpot > 0) s.tpots.push(r.tpot);
                if (Array.isArray(r.tokenTimes) && r.tokenTimes.length > 1) s.tokenTimesList.push(r.tokenTimes);
                if (r.totalTokens) s.totalTokens += r.totalTokens;
                // Prefill speed and cost are derived here so re-display always
                // uses current prices and raw per-request data
                if (r.inputTokens != null && r.firstTokenTime > 0) {
                    const prefill = r.inputTokens / (r.firstTokenTime / 1000);
                    if (prefill > 0) s.prefillTps.push(prefill);
                }
                if (r.inputTokens != null) s.inputTokensArr.push(r.inputTokens);
                if (r.totalTokens) s.outputTokensArr.push(r.totalTokens);
                const cost = this.computeCost(r.model, r.inputTokens ?? null, r.usage?.output ?? r.totalTokens ?? null);
                if (cost != null) s.costs.push(cost);
            } else {
                s.failedTests++;
                const t = r.errorType || 'other';
                s.errorTypes[t] = (s.errorTypes[t] || 0) + 1;
            }
        });
        return stats;
    }

    generateStatistics() {
        if (this.testResults.length === 0) return;
        const stats = this.computeStatistics();
        this.saveHistoryRecord(stats);
        this.displayStatistics(stats);
    }

    aggregateGroup(s) {
        const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
        // Pool per-token intervals across all requests in the group (ITL basis)
        const intervals = [];
        (s.tokenTimesList || []).forEach(times => {
            for (let i = 1; i < times.length; i++) {
                const d = times[i] - times[i - 1];
                if (d >= 0) intervals.push(d);
            }
        });
        let itlMax = null;
        let stalls = 0;
        for (const d of intervals) {
            if (itlMax === null || d > itlMax) itlMax = d;
            if (d > 1000) stalls++;
        }
        const sr = s.totalTests > 0 ? (s.successfulTests / s.totalTests) * 100 : 0;
        return {
            avgFirstToken: avg(s.firstTokenTimes),
            p50FirstToken: this.percentile(s.firstTokenTimes, 50),
            p90FirstToken: this.percentile(s.firstTokenTimes, 90),
            p95FirstToken: this.percentile(s.firstTokenTimes, 95),
            p99FirstToken: this.percentile(s.firstTokenTimes, 99),
            avgTotalLatency: avg(s.totalLatencies),
            avgOutputSpeed: avg(s.outputSpeeds),
            p50Speed: this.percentile(s.outputSpeeds, 50),
            p90Speed: this.percentile(s.outputSpeeds, 90),
            avgTpot: avg(s.tpots),
            itlAvg: avg(intervals),
            itlP90: this.percentile(intervals, 90),
            itlMax,
            itlStalls: stalls,
            avgInputTokens: avg(s.inputTokensArr),
            avgOutputTokens: avg(s.outputTokensArr),
            maxOutputTokens: s.outputTokensArr.length ? s.outputTokensArr.reduce((a, b) => Math.max(a, b), 0) : null,
            avgPrefillTps: avg(s.prefillTps),
            totalCost: s.costs.length ? s.costs.reduce((a, b) => a + b, 0) : null,
            avgCost: avg(s.costs),
            tokensPerDollar: (s.costs.length && s.totalTokens) ? s.totalTokens / s.costs.reduce((a, b) => a + b, 0) : null,
            errorRate: s.totalTests > 0 ? ((s.failedTests || 0) / s.totalTests) * 100 : 0,
            errorDist: s.errorTypes || {},
            successRate: sr
        };
    }

    displayStatistics(stats) {
        const section = document.getElementById('statisticsSection');
        const body = document.getElementById('statisticsBody');
        if (!section || !body) return;
        body.innerHTML = '';

        const maxSpeed = Math.max(...Object.values(stats).map(s => s.outputSpeeds.length ? s.outputSpeeds.reduce((a, b) => a + b, 0) / s.outputSpeeds.length : 0), 1);

        Object.keys(stats).forEach(key => {
            const s = stats[key];
            const g = this.aggregateGroup(s);
            const fmtMs = v => (v !== null && v !== undefined) ? v.toFixed(2) + 'ms' : '-';
            const fmtNum = v => (v !== null && v !== undefined) ? v : '-';
            const avgOS = g.avgOutputSpeed !== null ? g.avgOutputSpeed.toFixed(2) : '-';
            const sr = g.successRate.toFixed(1);

            let rateClass = '';
            const rateNum = parseFloat(sr);
            if (rateNum >= 95) rateClass = 'high';
            else if (rateNum >= 80) rateClass = 'medium';
            else rateClass = 'low';

            const bar = g.avgOutputSpeed !== null
                ? '<div class="speed-bar"><div class="speed-bar-fill" style="width:' + Math.round(g.avgOutputSpeed / maxSpeed * 100) + '%"></div></div>'
                : '';

            const itlTitle = (g.itlP90 !== null && g.itlP90 !== undefined)
                ? ` title="${i18n.t('tooltipStalls')}: ${g.itlStalls} · avg ${g.itlAvg !== null ? g.itlAvg.toFixed(0) : '-'}ms · max ${g.itlMax !== null ? g.itlMax.toFixed(0) : '-'}ms"`
                : '';
            const distText = Object.entries(g.errorDist).map(([k, v]) => `${i18n.t('err_' + k)}×${v}`).join(', ');
            const srTitle = distText ? ` title="${this.escapeHtml(i18n.t('errorRate') + ' ' + g.errorRate.toFixed(1) + '%: ' + distText)}"` : '';
            const costTitle = (g.avgCost !== null && g.avgCost !== undefined)
                ? ` title="total $${g.totalCost.toFixed(6)} · ${i18n.t('tokensPerDollar')}: ${g.tokensPerDollar !== null ? g.tokensPerDollar.toFixed(0) : '-'}"`
                : '';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.escapeHtml(s.model)}</td>
                <td class="target-cell" title="${this.escapeHtml(s.target)}">${this.escapeHtml(this.truncateText(s.target, 30))}</td>
                <td>${fmtMs(g.avgFirstToken)}</td>
                <td>${fmtMs(g.p50FirstToken)}</td>
                <td>${fmtMs(g.p90FirstToken)}</td>
                <td>${fmtMs(g.p95FirstToken)}</td>
                <td>${fmtMs(g.p99FirstToken)}</td>
                <td>${fmtMs(g.avgTotalLatency)}</td>
                <td>${avgOS !== '-' ? avgOS + ' t/s' + bar : '-'}</td>
                <td>${fmtNum(g.p50Speed)}</td>
                <td>${fmtNum(g.p90Speed)}</td>
                <td>${fmtMs(g.avgTpot)}</td>
                <td${itlTitle}>${fmtMs(g.itlP90)}</td>
                <td>${(g.avgPrefillTps !== null && g.avgPrefillTps !== undefined) ? g.avgPrefillTps.toFixed(0) + ' t/s' : '-'}</td>
                <td>${s.totalTokens}</td>
                <td${costTitle}>${(g.avgCost !== null && g.avgCost !== undefined) ? '$' + g.avgCost.toFixed(6) : '-'}</td>
                <td class="stats-success-rate ${rateClass}" data-rate="${sr}"${srTitle}>${sr}%</td>
            `;
            body.appendChild(row);
        });

        section.classList.remove('hidden');
        this.renderHistoryRecords();
    }

    // ── Real-time viewer ────────────────────────────────────────────────────
    showRealtimeViewer() {
        document.getElementById('realtimeViewer')?.classList.remove('viewer-hidden');
        this.isViewerVisible = true;
    }
    hideRealtimeViewer() {
        document.getElementById('realtimeViewer')?.classList.add('viewer-hidden');
        this.isViewerVisible = false;
    }

    // Pin the live viewer to one streaming request (per-row 实时查看 button)
    pinRealtimeViewer(testId, row) {
        this.currentTestId = testId;
        this.showRealtimeViewer();
        const btn = row.querySelector('.view-result-btn');
        this.updateRealtimeViewer(testId, row.dataset.model, row.dataset.prompt, row.dataset.round, {
            status: 'testing',
            result: btn?.dataset.fullText || '',
            firstTokenTime: parseFloat(row.querySelector('.first-token')?.textContent) || null,
            outputSpeed: row.querySelector('.output-speed')?.textContent || null
        });
    }

    showResultDetailViewer() {
        const v = document.getElementById('resultDetailViewer');
        v?.classList.remove('viewer-hidden');
        this.isDetailViewerVisible = true;
    }
    hideResultDetailViewer() {
        const v = document.getElementById('resultDetailViewer');
        v?.classList.add('viewer-hidden');
        this.isDetailViewerVisible = false;
    }

    updateResultDetailViewer(testId, model, prompt, round, progress) {
        if (!this.isDetailViewerVisible) return;
        document.getElementById('detailModel').textContent = model;
        document.getElementById('detailPrompt').textContent = prompt;
        document.getElementById('detailRound').textContent = `${i18n.t('round')} ${round}`;
        const st = document.getElementById('detailStatus');
        if (st) { st.textContent = i18n.t(progress.status || 'testing'); st.className = `test-status ${progress.status || 'testing'}`; }
        const re = document.getElementById('detailResult');
        if (re) {
            re.textContent = progress.result || '';
            re.closest('.result-display')?.scrollTo(0, re.closest('.result-display').scrollHeight);
        }
    }

    handleViewResultClick(event, testId) {
        event.preventDefault();
        const btn = event.target;
        const row = document.getElementById(testId);
        if (!row || btn.disabled) return;

        // 流式进行中：实时查看（钉住该请求的实时流）
        if (btn.dataset.live === '1') {
            this.pinRealtimeViewer(testId, row);
            return;
        }

        // 已结束：查看结果（详情查看器）
        const model = row.dataset.model;
        const prompt = row.dataset.prompt;
        const round = row.dataset.round;
        const fullText = btn.dataset.fullText;

        this.showResultDetailViewer();
        if (fullText) {
            this.updateResultDetailViewer(testId, model, prompt, round, {
                status: 'completed', result: fullText,
                firstTokenTime: row.querySelector('.first-token')?.textContent.replace('ms', '') || null,
                outputSpeed: row.querySelector('.output-speed')?.textContent || null
            });
        }
    }

    updateRealtimeViewer(testId, model, prompt, round, progress) {
        if (!this.isViewerVisible) return;
        document.getElementById('currentModel').textContent = model;
        document.getElementById('currentPrompt').textContent = prompt;
        document.getElementById('currentRound').textContent = `${i18n.t('round')} ${round}`;
        const st = document.getElementById('currentStatus');
        if (st) { st.textContent = i18n.t(progress.status || 'testing'); st.className = `test-status ${progress.status || 'testing'}`; }
        const re = document.getElementById('realtimeResult');
        if (re) {
            re.textContent = progress.result || '';
            document.querySelector('.result-display')?.scrollTo(0, document.querySelector('.result-display').scrollHeight);
        }
        document.getElementById('viewerFirstToken').textContent = progress.firstTokenTime ? `${progress.firstTokenTime}ms` : '-';
        document.getElementById('viewerSpeed').textContent = progress.outputSpeed ? `${progress.outputSpeed} t/s` : '-';
        document.getElementById('viewerTokens').textContent = progress.result ? this.estimateTokens(progress.result) : '-';
    }

    estimateTokens(text) {
        if (!text) return 0;
        let tokens = 0;
        for (const char of text) {
            const code = char.codePointAt(0);
            if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3000 && code <= 0x30FF) || (code >= 0xAC00 && code <= 0xD7AF)) tokens += 1;
            else tokens += 0.25;
        }
        return Math.ceil(tokens);
    }

    // ── History ──────────────────────────────────────────────────────────────
    saveHistoryRecord(stats) {
        try {
            const config = this.getConfig();
            const record = {
                timestamp: new Date().toISOString(),
                testDate: new Date().toLocaleString('zh-CN'),
                targets: config.targets.filter(t => t.enabled !== false).map(t => this.targetLabel(t)),
                modelStats: {},
                summary: {
                    totalModels: Object.keys(stats).length,
                    totalTests: this.testResults.length,
                    successfulTests: this.testResults.filter(r => r.status === 'completed' && !r.error).length
                }
            };
            Object.keys(stats).forEach(key => {
                const s = stats[key];
                const g = this.aggregateGroup(s);
                record.modelStats[key] = { model: s.model, target: s.target,
                    avgFirstTokenTime: g.avgFirstToken, p95FirstToken: g.p95FirstToken, p99FirstToken: g.p99FirstToken,
                    avgTotalLatency: g.avgTotalLatency, avgOutputSpeed: g.avgOutputSpeed,
                    avgTpot: g.avgTpot, itlP90: g.itlP90, errorRate: g.errorRate, errorDist: g.errorDist,
                    successRate: g.successRate, totalTests: s.totalTests, successfulTests: s.successfulTests, totalTokens: s.totalTokens };
            });
            const existing = this.getHistoryRecords();
            existing.unshift(record);
            localStorage.setItem('apiTesterHistory', JSON.stringify(existing.slice(0, 5)));
        } catch (e) { console.warn('Failed to save history:', e); }
    }

    getHistoryRecords() {
        try { const s = localStorage.getItem('apiTesterHistory'); return s ? JSON.parse(s) : []; } catch { return []; }
    }

    clearHistoryRecords() { localStorage.removeItem('apiTesterHistory'); }

    renderHistoryRecords() {
        const content = document.getElementById('historyContent');
        if (!content) return;
        const history = this.getHistoryRecords();
        if (history.length === 0) {
            content.innerHTML = '<div class="history-empty"><p data-i18n="historyEmpty">No history records found</p></div>';
            if (window.i18n) window.i18n.updateTexts();
            return;
        }
        let html = '';
        history.forEach((rec, i) => {
            html += `<div class="history-record">
                <div class="history-header">
                    <h3><span data-i18n="record">Record</span> #${i + 1}</h3>
                    <div class="history-meta">
                        <span class="test-date"><strong data-i18n="testDate">Test Date:</strong> ${this.escapeHtml(rec.testDate)}</span>
                        <span class="api-endpoint"><strong data-i18n="apiEndpoint">API Endpoint:</strong> ${this.escapeHtml(rec.targets?.join(', ') || '')}</span>
                    </div>
                </div>
                <div class="history-summary">
                    <div class="summary-stats">
                        <span><strong data-i18n="totalModels">Total Models:</strong> ${rec.summary.totalModels}</span>
                        <span><strong data-i18n="totalTests">Total Tests:</strong> ${rec.summary.totalTests}</span>
                        <span><strong data-i18n="successfulTests">Successful Tests:</strong> ${rec.summary.successfulTests}</span>
                        <span><strong data-i18n="successRate">Success Rate:</strong> ${((rec.summary.successfulTests / rec.summary.totalTests) * 100).toFixed(1)}%</span>
                    </div>
                </div>
                <div class="history-details">
                    <table class="history-table"><thead><tr>
                        <th data-i18n="model">Model</th>
                        <th data-i18n="target">Target</th>
                        <th data-i18n="averageFirstToken">Avg First Token (ms)</th>
                        <th data-i18n="averageOutputSpeed">Avg Output Speed (t/s)</th>
                        <th data-i18n="tpot">Avg TPOT (ms/token)</th>
                        <th data-i18n="itlP90">ITL P90 (ms)</th>
                        <th data-i18n="totalTokens">Total Tokens</th>
                        <th data-i18n="successRate">Success Rate</th>
                    </tr></thead><tbody>`;
            Object.keys(rec.modelStats).forEach(key => {
                const s = rec.modelStats[key];
                html += `<tr>
                    <td>${this.escapeHtml(s.model)}</td>
                    <td>${this.escapeHtml(s.target || '')}</td>
                    <td>${s.avgFirstTokenTime ? s.avgFirstTokenTime.toFixed(2) + 'ms' : '-'}</td>
                    <td>${s.avgOutputSpeed ? s.avgOutputSpeed.toFixed(2) + ' t/s' : '-'}</td>
                    <td>${s.avgTpot ? s.avgTpot.toFixed(2) + 'ms' : '-'}</td>
                    <td>${s.itlP90 ? s.itlP90.toFixed(0) + 'ms' : '-'}</td>
                    <td>${s.totalTokens || '-'}</td>
                    <td>${s.successRate.toFixed(1)}%</td>
                </tr>`;
            });
            html += `</tbody></table></div></div>`;
        });
        content.innerHTML = html;
        if (window.i18n) window.i18n.updateTexts();
    }

    confirmClearHistory() {
        if (confirm(i18n.t('confirmClearHistory'))) {
            this.clearHistoryRecords();
            this.renderHistoryRecords();
            alert(i18n.t('historyCleared'));
        }
    }
}

let apiTester;
document.addEventListener('DOMContentLoaded', () => { apiTester = new APITester(); });
