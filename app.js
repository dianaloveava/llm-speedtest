// Main application logic — multi-target concurrent testing, workbench UI.
// State lives in this.testResults; the DOM is a pure rendering of it.

const STORAGE_CONFIG = 'apiTesterConfig';
const STORAGE_HISTORY = 'apiTesterHistory';
const MAX_HISTORY = 20;

const DEFAULT_PROMPTS = [
    'Explain the concept of "quantum entanglement" to a high school student, including its potential applications.',
    'Discuss the primary ethical challenges posed by the rapid development of autonomous vehicles.',
    'Write a short story about a sentient AI that discovers a hidden message within the internet\'s oldest data archives.'
];

class APITester {
    constructor() {
        this.testResults = [];
        this.runId = 0;
        this.isRunning = false;
        this.currentRunPromise = null;
        this.abortController = null;
        this.targetCounter = 0;
        this.activeFetchTarget = null;
        this.totalPlanned = 0;
        this.completedCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.cancelledCount = 0;
        this.sortKey = null;
        this.sortDir = 1;
        this.filterStatus = 'all';
        this.filterQuery = '';
        this.pinnedTestId = null;
        this.runConfigSnapshot = null;
        this._saveTimer = null;
        this._searchTimer = null;
        this._beforeUnload = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedConfig();
        if (this.promptRowCount() === 0) this.restorePrompts();
        if (document.querySelectorAll('.target-row').length === 0) this.addTargetRow();
        this.syncConfigToggle();
        this.renderResults();
        this.displayStatistics({});
        this.renderHistoryRecords();
        this.updateRunControls(false);
        this.updateRunProgress();
        if (typeof i18n !== 'undefined') i18n.onChange(() => this.refreshI18n());
    }

    // ── Event wiring ────────────────────────────────────────────────────────
    setupEventListeners() {
        const on = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };

        on('startTest', 'click', () => this.startTests());
        on('stopTest', 'click', () => this.stopTests());
        on('addTarget', 'click', () => this.addTargetRow());
        on('addPrompt', 'click', () => this.addPromptRow('', true));
        on('restorePromptsBtn', 'click', () => this.restorePrompts());
        on('configToggle', 'click', () => this.toggleConfigPanel());

        // Model picker
        on('modelPickerSearch', 'input', (e) => this.filterModelPicker(e.target.value));
        on('selectAllModels', 'click', () => this.toggleAllModels(true));
        on('deselectAllModels', 'click', () => this.toggleAllModels(false));
        on('useSelectedModels', 'click', () => this.applySelectedModels());
        on('modelPickerDialog', 'close', () => this.restoreDialogFocus());

        // Exports
        on('exportCsv', 'click', () => this.exportResults('csv'));
        on('exportJson', 'click', () => this.exportResults('json'));
        on('exportStatistics', 'click', () => this.exportStatistics());
        on('exportHistoryBtn', 'click', () => this.exportHistory());

        // Results toolbar
        on('statusFilter', 'change', (e) => { this.filterStatus = e.target.value; this.renderResults(); });
        on('resultSearch', 'input', (e) => {
            const value = e.target.value;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => { this.filterQuery = value; this.renderResults(); }, 150);
        });
        on('retryFailedBtn', 'click', () => this.retryFailed());
        on('clearResultsBtn', 'click', () => this.clearResults());

        // Config import / export
        on('exportConfigBtn', 'click', () => this.exportConfig());
        on('importConfigBtn', 'click', () => document.getElementById('importConfigInput')?.click());
        on('importConfigInput', 'change', (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (file) this.importConfigFile(file);
        });

        // Persist scalar + prompt edits
        ['rounds', 'concurrency', 'maxTokens', 'temperature', 'topP', 'timeoutSec', 'systemPrompt', 'modelPrices']
            .forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('input', () => this.saveConfig());
                el.addEventListener('change', () => this.saveConfig());
            });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setActiveTab(btn.dataset.tab));
        });

        // Results interactions
        document.getElementById('resultsTable')?.addEventListener('click', (e) => {
            const th = e.target.closest('th[data-sort]');
            if (th) { this.toggleSort(th.dataset.sort); return; }
            const view = e.target.closest('.view-btn');
            if (view) { this.onViewClick(view.dataset.testId); return; }
            const del = e.target.closest('.del-btn');
            if (del) this.deleteResultRow(del.dataset.testId);
        });

        // History interactions
        document.getElementById('historyList')?.addEventListener('click', (e) => {
            const rerun = e.target.closest('.rerun-btn');
            if (rerun) { this.rerunFromRecord(Number(rerun.dataset.index)); return; }
            const del = e.target.closest('.delete-history-btn');
            if (del) this.deleteHistoryRecord(Number(del.dataset.index));
        });
        on('clearHistoryBtn', 'click', () => this.clearHistory());
    }

    // ── Small helpers ───────────────────────────────────────────────────────
    num(value, fallback) {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : fallback;
    }

    clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    splitLines(text) {
        if (Array.isArray(text)) {
            return [...new Set(text.map(s => String(s).trim()).filter(Boolean))];
        }
        return [...new Set(String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
    }

    escapeHtml(text) {
        return String(text ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    truncate(text, max) {
        const s = String(text ?? '');
        return s.length <= max ? s : s.slice(0, max) + '…';
    }

    todayStamp() {
        return new Date().toISOString().split('T')[0];
    }

    applyI18n(root) {
        if (!root || typeof i18n === 'undefined') return;
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = i18n.t(el.getAttribute('data-i18n'));
        });
        root.querySelectorAll('[data-i18n-ph]').forEach(el => {
            el.setAttribute('placeholder', i18n.t(el.getAttribute('data-i18n-ph')));
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.setAttribute('title', i18n.t(el.getAttribute('data-i18n-title')));
        });
        root.querySelectorAll('[data-i18n-aria]').forEach(el => {
            el.setAttribute('aria-label', i18n.t(el.getAttribute('data-i18n-aria')));
        });
    }

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // ── Tabs ────────────────────────────────────────────────────────────────
    setActiveTab(name) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.setAttribute('aria-selected', String(btn.dataset.tab === name));
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.hidden = panel.id !== `tab-${name}`;
        });
    }

    // ── Mobile config panel ─────────────────────────────────────────────────
    syncConfigToggle() {
        const panel = document.getElementById('configPanel');
        const btn = document.getElementById('configToggle');
        if (!panel || !btn) return;
        btn.setAttribute('aria-expanded', String(!panel.classList.contains('collapsed')));
    }

    toggleConfigPanel() {
        const panel = document.getElementById('configPanel');
        if (!panel) return;
        panel.classList.toggle('collapsed');
        this.syncConfigToggle();
    }

    expandConfigPanel() {
        const panel = document.getElementById('configPanel');
        if (!panel) return;
        panel.classList.remove('collapsed');
        this.syncConfigToggle();
        if (window.matchMedia('(max-width: 1024px)').matches) {
            panel.scrollIntoView({ block: 'start' });
        }
    }

    // ── Target rows ─────────────────────────────────────────────────────────
    protocolOptionsHtml(selected) {
        return APIHandler.listProtocols().map(p =>
            `<option value="${this.escapeHtml(p.id)}"${p.id === selected ? ' selected' : ''}>${this.escapeHtml(p.label)}</option>`
        ).join('');
    }

    addTargetRow(data) {
        const list = document.getElementById('targetList');
        if (!list) return null;

        const id = ++this.targetCounter;
        const protocol = data?.protocol || 'openai-chat-completions';
        const apiUrl = data?.apiUrl || '';
        const apiKey = data?.apiKey || '';
        const models = Array.isArray(data?.models) ? data.models.join('\n') : (data?.models || '');

        const row = document.createElement('div');
        row.className = 'target-row';
        row.dataset.targetId = String(id);
        row.innerHTML = `
            <div class="target-head">
                <span class="target-label">#${list.children.length + 1}</span>
                <div class="target-actions">
                    <button type="button" class="icon-btn act-dup" data-i18n-title="duplicateTarget" data-i18n-aria="duplicateTarget">⧉</button>
                    <button type="button" class="icon-btn act-up" data-i18n-title="moveUp" data-i18n-aria="moveUp">↑</button>
                    <button type="button" class="icon-btn act-down" data-i18n-title="moveDown" data-i18n-aria="moveDown">↓</button>
                    <button type="button" class="icon-btn act-toggle"></button>
                    <button type="button" class="icon-btn act-remove" data-i18n-title="removeTarget" data-i18n-aria="removeTarget">✕</button>
                </div>
            </div>
            <div class="target-fields">
                <div class="field">
                    <label class="field-label" for="tp-${id}" data-i18n="targetProtocol">Protocol</label>
                    <div class="protocol-row">
                        <select id="tp-${id}" class="target-protocol">${this.protocolOptionsHtml(protocol)}</select>
                        <button type="button" class="btn btn-ghost btn-sm detect-protocol" data-i18n="detectProtocol">检测协议</button>
                    </div>
                </div>
                <div class="field">
                    <label class="field-label" for="tu-${id}" data-i18n="targetApiUrl">Base URL</label>
                    <input type="url" id="tu-${id}" class="target-apiurl" placeholder="https://api.openai.com" autocomplete="off">
                    <div class="url-preview chat-url-preview"></div>
                </div>
                <div class="field">
                    <label class="field-label" for="tk-${id}" data-i18n="targetApiKey">API Key</label>
                    <div class="key-wrap">
                        <input type="password" id="tk-${id}" class="target-apikey" placeholder="sk-..." autocomplete="off">
                        <button type="button" class="icon-btn toggle-key" data-i18n-title="toggleApiKey" data-i18n-aria="toggleApiKey">👁</button>
                    </div>
                </div>
                <div class="field">
                    <div class="models-head">
                        <label class="field-label" for="tm-${id}" data-i18n="targetModels">Models (one per line)</label>
                        <button type="button" class="btn btn-ghost btn-sm fetch-models-btn" data-i18n="fetchModels">Fetch Models</button>
                    </div>
                    <textarea id="tm-${id}" class="target-models" rows="2" placeholder="gpt-3.5-turbo"></textarea>
                </div>
            </div>
        `;
        this.applyI18n(row);

        row.querySelector('.target-protocol').value = protocol;
        row.querySelector('.target-apiurl').value = apiUrl;
        row.querySelector('.target-apikey').value = apiKey;
        row.querySelector('.target-models').value = models;

        this.wireTargetRow(row);
        list.appendChild(row);
        if (data?.enabled === false) this.setTargetDisabled(row, true);

        this.completeTargetUrl(row);
        this.updateTargetPreview(row);
        this.updateTargetLabels();
        this.updateTargetButtons();
        this.saveConfig();
        return row;
    }

    wireTargetRow(row) {
        const protocolSel = row.querySelector('.target-protocol');
        const apiUrlInput = row.querySelector('.target-apiurl');
        const apiKeyInput = row.querySelector('.target-apikey');
        const modelsInput = row.querySelector('.target-models');
        const toggleKeyBtn = row.querySelector('.toggle-key');

        protocolSel.addEventListener('change', () => {
            this.completeTargetUrl(row);
            this.updateTargetPreview(row);
            this.saveConfig();
        });
        apiUrlInput.addEventListener('input', () => {
            this.updateTargetPreview(row);
            this.saveConfig();
        });
        apiKeyInput.addEventListener('input', () => this.saveConfig());
        modelsInput.addEventListener('input', () => this.saveConfig());

        row.querySelector('.act-toggle').addEventListener('click', () => {
            this.setTargetDisabled(row, !row.classList.contains('target-disabled'));
            this.saveConfig();
        });
        row.querySelector('.act-dup').addEventListener('click', () => this.duplicateTargetRow(row));
        row.querySelector('.act-up').addEventListener('click', () => this.moveTarget(row, -1));
        row.querySelector('.act-down').addEventListener('click', () => this.moveTarget(row, 1));
        row.querySelector('.act-remove').addEventListener('click', () => this.removeTargetRow(row));
        row.querySelector('.fetch-models-btn').addEventListener('click', () => this.fetchModels(row));
        row.querySelector('.detect-protocol').addEventListener('click', () => this.detectTargetProtocol(row));

        toggleKeyBtn.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleKeyBtn.textContent = '🙈';
            } else {
                apiKeyInput.type = 'password';
                toggleKeyBtn.textContent = '👁';
            }
        });
    }

    setTargetDisabled(row, disabled) {
        row.classList.toggle('target-disabled', disabled);
        const btn = row.querySelector('.act-toggle');
        if (!btn) return;
        btn.textContent = disabled ? '○' : '●';
        const label = i18n.t(disabled ? 'enableTarget' : 'disableTarget');
        btn.title = label;
        btn.setAttribute('aria-label', label);
    }

    updateTargetLabels() {
        document.querySelectorAll('#targetList .target-row').forEach((row, i) => {
            const label = row.querySelector('.target-label');
            if (label) label.textContent = `#${i + 1}`;
        });
    }

    updateTargetButtons() {
        const rows = Array.from(document.querySelectorAll('#targetList .target-row'));
        rows.forEach((row, i) => {
            const up = row.querySelector('.act-up');
            const down = row.querySelector('.act-down');
            const rm = row.querySelector('.act-remove');
            if (up) up.disabled = i === 0;
            if (down) down.disabled = i === rows.length - 1;
            if (rm) rm.disabled = rows.length <= 1;
        });
    }

    duplicateTargetRow(row) {
        const data = this.getTargetData(row);
        const clone = this.addTargetRow({
            protocol: data.protocol,
            apiUrl: data.apiUrl,
            apiKey: '',
            models: data.models.slice(),
            enabled: data.enabled
        });
        if (clone) {
            row.after(clone);
            this.updateTargetLabels();
            this.updateTargetButtons();
            this.saveConfig();
        }
    }

    moveTarget(row, dir) {
        const list = document.getElementById('targetList');
        if (!list) return;
        const rows = Array.from(list.children);
        const i = rows.indexOf(row);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= rows.length) return;
        if (dir < 0) list.insertBefore(row, rows[j]);
        else list.insertBefore(rows[j], row);
        this.updateTargetLabels();
        this.updateTargetButtons();
        this.saveConfig();
    }

    removeTargetRow(row) {
        const list = document.getElementById('targetList');
        if (!list || list.children.length <= 1) return;
        row.remove();
        this.updateTargetLabels();
        this.updateTargetButtons();
        this.saveConfig();
    }

    completeTargetUrl(row) {
        const protocol = row.querySelector('.target-protocol').value;
        const apiUrlInput = row.querySelector('.target-apiurl');
        const defaultBase = APIHandler.getDefaultBaseUrl(protocol);
        apiUrlInput.placeholder = defaultBase;

        const currentVal = apiUrlInput.value.trim();
        const allDefaults = APIHandler.getAllDefaultBaseUrls();
        const allChatUrls = APIHandler.getAllChatUrls();
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
        if (!spec) { preview.textContent = ''; return; }

        if (spec.id === 'google-generative-ai') {
            preview.textContent = APIHandler.smartCompleteUrl(baseUrl, spec.chatPath) + '?alt=sse';
        } else {
            preview.textContent = APIHandler.smartCompleteUrl(baseUrl, spec.chatPath);
        }
    }

    getTargetData(row) {
        return {
            enabled: !row.classList.contains('target-disabled'),
            protocol: row.querySelector('.target-protocol')?.value || 'openai-chat-completions',
            apiUrl: (row.querySelector('.target-apiurl')?.value || '').trim(),
            apiKey: (row.querySelector('.target-apikey')?.value || '').trim(),
            models: this.splitLines(row.querySelector('.target-models')?.value || '')
        };
    }

    getAllTargets() {
        return Array.from(document.querySelectorAll('#targetList .target-row')).map(row => this.getTargetData(row));
    }

    targetLabel(target) {
        const spec = APIHandler.getProtocol(target.protocol);
        const label = spec ? spec.label : target.protocol;
        let host = '';
        let pathname = '';
        try {
            const u = new URL(target.apiUrl);
            host = u.host;
            pathname = u.pathname;
        } catch (_) {
            host = target.apiUrl || '';
        }
        const suffix = pathname && pathname !== '/' ? pathname : '';
        return `${label} @ ${host}${suffix}`;
    }

    // Origin shown in error hints; falls back to the raw text when unparseable.
    originOf(url) {
        try {
            return new URL(url).origin;
        } catch (_) {
            return String(url || '').trim() || '-';
        }
    }

    // ── Prompts ─────────────────────────────────────────────────────────────
    promptRowCount() {
        return document.querySelectorAll('#promptList .prompt-row').length;
    }

    addPromptRow(text = '', focus = false) {
        const list = document.getElementById('promptList');
        if (!list) return null;
        const row = document.createElement('div');
        row.className = 'prompt-row';
        row.innerHTML = `
            <textarea class="prompt-input" rows="2" data-i18n-ph="promptPh" placeholder="Prompt text..."></textarea>
            <button type="button" class="icon-btn prompt-remove" data-i18n-title="deletePrompt" data-i18n-aria="deletePrompt">✕</button>
        `;
        this.applyI18n(row);
        const ta = row.querySelector('.prompt-input');
        ta.value = text;
        ta.addEventListener('input', () => this.saveConfig());
        ta.addEventListener('change', () => this.saveConfig());
        row.querySelector('.prompt-remove').addEventListener('click', () => {
            row.remove();
            if (this.promptRowCount() === 0) this.addPromptRow('');
            this.saveConfig();
        });
        list.appendChild(row);
        if (focus) ta.focus();
        this.saveConfig();
        return row;
    }

    getPrompts() {
        return Array.from(document.querySelectorAll('#promptList .prompt-input'))
            .map(ta => ta.value.trim())
            .filter(Boolean);
    }

    restorePrompts() {
        const list = document.getElementById('promptList');
        if (!list) return;
        list.innerHTML = '';
        DEFAULT_PROMPTS.forEach(p => this.addPromptRow(p));
        this.saveConfig();
    }

    // ── Config read / validate / persist ────────────────────────────────────
    getConfig() {
        const get = (id) => document.getElementById(id)?.value ?? '';
        return {
            targets: this.getAllTargets(),
            prompts: this.getPrompts(),
            rounds: this.clamp(Math.round(this.num(get('rounds'), 1)), 1, 10),
            maxTokens: this.clamp(Math.round(this.num(get('maxTokens'), 1000)), 1, 32000),
            temperature: this.num(get('temperature'), 0.7),
            topP: this.num(get('topP'), 1),
            concurrency: this.clamp(Math.round(this.num(get('concurrency'), 1)), 1, 10),
            timeoutSec: this.clamp(this.num(get('timeoutSec'), 120), 5, 600),
            systemPrompt: get('systemPrompt'),
            modelPrices: get('modelPrices')
        };
    }

    validateConfig(config) {
        const errors = [];
        const targets = config.targets || [];
        const enabled = targets.filter(t => t.enabled !== false);
        if (enabled.length === 0) {
            errors.push(i18n.t('noEnabledTargets'));
            return errors;
        }
        targets.forEach((t, i) => {
            if (t.enabled === false) return;
            const n = i + 1;
            if (!t.apiUrl) {
                errors.push(i18n.t('urlRequired', { n }));
            } else if (!APIHandler.isValidUrl(t.apiUrl)) {
                errors.push(i18n.t('urlInvalid', { n }));
            }
            const spec = APIHandler.getProtocol(t.protocol);
            if (spec && spec.auth.type !== 'none' && !t.apiKey) {
                errors.push(i18n.t('keyRequired', { n }));
            }
            if (!t.models || t.models.length === 0) {
                errors.push(i18n.t('modelsRequired', { n }));
            }
            const limits = APIHandler.getLimits(t.protocol);
            if (config.temperature > limits.temperature) {
                errors.push(i18n.t('temperatureLimit', { n, max: limits.temperature }));
            }
            if (config.topP > limits.topP) {
                errors.push(i18n.t('topPLimit', { n, max: limits.topP }));
            }
        });
        if (!config.prompts || config.prompts.length === 0) {
            errors.push(i18n.t('promptRequired'));
        }
        return errors;
    }

    loadSavedConfig() {
        let saved = null;
        try {
            const raw = localStorage.getItem(STORAGE_CONFIG);
            if (raw) saved = JSON.parse(raw);
        } catch (err) {
            console.warn('Failed to load saved config:', err);
        }
        if (!saved || typeof saved !== 'object') return;

        ['rounds', 'concurrency', 'maxTokens', 'temperature', 'topP', 'timeoutSec', 'systemPrompt', 'modelPrices']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el && saved[id] !== undefined && saved[id] !== null) el.value = saved[id];
            });

        // prompts: v2 array, v1 newline-separated string
        const prompts = Array.isArray(saved.prompts)
            ? saved.prompts
            : (typeof saved.prompts === 'string' ? this.splitLines(saved.prompts) : []);
        prompts.forEach(p => this.addPromptRow(p));

        if (Array.isArray(saved.targets)) {
            saved.targets.forEach(t => this.addTargetRow({
                protocol: t?.protocol,
                apiUrl: t?.apiUrl,
                apiKey: t?.apiKey,
                models: t?.models,
                enabled: t?.enabled !== false
            }));
        }
    }

    saveConfig() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.writeConfig(), 300);
    }

    writeConfig() {
        try {
            const config = this.getConfig();
            localStorage.setItem(STORAGE_CONFIG, JSON.stringify({
                version: 1,
                targets: config.targets,
                prompts: config.prompts,
                rounds: document.getElementById('rounds')?.value ?? '1',
                concurrency: document.getElementById('concurrency')?.value ?? '1',
                maxTokens: document.getElementById('maxTokens')?.value ?? '1000',
                temperature: document.getElementById('temperature')?.value ?? '0.7',
                topP: document.getElementById('topP')?.value ?? '1',
                timeoutSec: document.getElementById('timeoutSec')?.value ?? '120',
                systemPrompt: config.systemPrompt,
                modelPrices: config.modelPrices
            }));
        } catch (err) {
            console.warn('Failed to save config:', err);
        }
    }

    stripKeys(config) {
        return Object.assign({}, config, {
            targets: (config.targets || []).map(t => Object.assign({}, t, { apiKey: '' }))
        });
    }

    exportConfig() {
        const payload = Object.assign({ version: 1, exportedAt: new Date().toISOString() },
            this.stripKeys(this.getConfig()));
        this.downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
            `llm_speedtest_config_${this.todayStamp()}.json`);
        this.showToast(i18n.t('keysNotExported'), 'info');
    }

    async importConfigFile(file) {
        let data = null;
        try {
            data = JSON.parse(await file.text());
        } catch (_) {
            this.showToast(i18n.t('configImportFailed'), 'error');
            return;
        }
        if (!data || !Array.isArray(data.targets)) {
            this.showToast(i18n.t('configImportFailed'), 'error');
            return;
        }
        if (!await this.askConfirm(i18n.t('confirmImportConfig'))) return;
        try {
            this.applyImportedConfig(data);
            this.showToast(i18n.t('configImported'), 'success');
        } catch (err) {
            console.warn('Config import failed:', err);
            this.showToast(i18n.t('configImportFailed'), 'error');
        }
    }

    applyImportedConfig(data) {
        const targetList = document.getElementById('targetList');
        if (targetList) targetList.innerHTML = '';
        (data.targets || []).forEach(t => this.addTargetRow({
            protocol: t?.protocol,
            apiUrl: t?.apiUrl,
            apiKey: '',
            models: t?.models,
            enabled: t?.enabled !== false
        }));
        if (document.querySelectorAll('#targetList .target-row').length === 0) this.addTargetRow();

        const promptList = document.getElementById('promptList');
        if (promptList) promptList.innerHTML = '';
        const prompts = Array.isArray(data.prompts)
            ? data.prompts
            : (typeof data.prompts === 'string' ? this.splitLines(data.prompts) : []);
        (prompts.length ? prompts : DEFAULT_PROMPTS).forEach(p => this.addPromptRow(p));

        ['rounds', 'concurrency', 'maxTokens', 'temperature', 'topP', 'timeoutSec', 'systemPrompt', 'modelPrices']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el && data[id] !== undefined && data[id] !== null) el.value = data[id];
            });

        this.updateTargetLabels();
        this.updateTargetButtons();
        this.writeConfig();
    }

    // ── Model fetching + picker dialog ──────────────────────────────────────
    async fetchModels(row) {
        const target = this.getTargetData(row);
        const btn = row.querySelector('.fetch-models-btn');
        if (btn) { btn.disabled = true; btn.textContent = i18n.t('fetchingModels'); }
        this.activeFetchTarget = row;
        try {
            const handler = new APIHandler(target.protocol, target.apiUrl, target.apiKey);
            const models = await handler.fetchModels();
            if (models.length === 0) {
                this.showToast(i18n.t('noModelsFetched'), 'error');
                return;
            }
            this.openModelPicker(models, row);
            this.showToast(`${i18n.t('fetchModelsSuccess')} (${models.length})`, 'success');
        } catch (err) {
            const message = (err && err.message) || String(err);
            // A network-level failure hides whether the port is dead or CORS
            // refused the request, so name both origins — localhost and
            // 127.0.0.1 are different origins and trip people up.
            let hint = '';
            if (this.classifyError(message) === 'network') {
                hint = ' ' + i18n.t('fetchModelsNetworkHint', {
                    page: window.location.origin,
                    api: this.originOf(target.apiUrl)
                });
            }
            this.showToast(`${i18n.t('fetchModelsFailed')}: ${message}${hint}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = i18n.t('fetchModels'); }
        }
    }

    openModelPicker(models, row) {
        const dialog = document.getElementById('modelPickerDialog');
        const list = document.getElementById('modelPickerList');
        if (!dialog || !list) return;
        this.activeFetchTarget = row || this.activeFetchTarget;
        this.lastDialogTrigger = document.activeElement;

        const existing = new Set(this.getTargetData(this.activeFetchTarget).models);
        list.innerHTML = models.map(m => `
            <label class="model-picker-item">
                <input type="checkbox" value="${this.escapeHtml(m)}"${existing.has(m) ? ' checked' : ''}>
                <span>${this.escapeHtml(m)}</span>
            </label>`).join('');

        const search = document.getElementById('modelPickerSearch');
        if (search) search.value = '';
        dialog.showModal();
        if (search) search.focus();
    }

    closeModelPicker() {
        const dialog = document.getElementById('modelPickerDialog');
        if (dialog && dialog.open) dialog.close();
    }

    restoreDialogFocus() {
        const trigger = this.lastDialogTrigger;
        this.lastDialogTrigger = null;
        if (trigger && document.body.contains(trigger)) trigger.focus();
    }

    filterModelPicker(query) {
        const q = String(query || '').toLowerCase();
        document.querySelectorAll('#modelPickerList .model-picker-item').forEach(item => {
            const match = item.textContent.toLowerCase().includes(q);
            item.classList.toggle('hidden', !match);
        });
    }

    toggleAllModels(checked) {
        document.querySelectorAll('#modelPickerList .model-picker-item:not(.hidden) input[type="checkbox"]')
            .forEach(cb => { cb.checked = checked; });
    }

    applySelectedModels() {
        const selected = Array.from(document.querySelectorAll('#modelPickerList input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        if (selected.length === 0) {
            this.showToast(i18n.t('noModelsSelected'), 'error');
            return;
        }
        const row = this.activeFetchTarget;
        if (!row || !document.body.contains(row)) {
            this.showToast(i18n.t('noModelsSelected'), 'error');
            this.closeModelPicker();
            return;
        }
        const merged = [...new Set([...this.getTargetData(row).models, ...selected])];
        row.querySelector('.target-models').value = merged.join('\n');
        this.saveConfig();
        this.closeModelPicker();
    }

    // ── Run orchestration ───────────────────────────────────────────────────
    createHandler(target, config) {
        return new APIHandler(target.protocol, target.apiUrl, target.apiKey, {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
            topP: config.topP,
            systemPrompt: config.systemPrompt,
            timeoutMs: (config.timeoutSec || 120) * 1000
        });
    }

    buildTasks(config) {
        const tasks = [];
        for (const target of config.targets) {
            if (target.enabled === false) continue;
            const label = this.targetLabel(target);
            const handler = this.createHandler(target, config);
            for (const model of target.models) {
                for (const prompt of config.prompts) {
                    for (let round = 1; round <= config.rounds; round++) {
                        tasks.push({ handler, model, prompt, round, label });
                    }
                }
            }
        }
        return tasks;
    }

    // ── Protocol detection ────────────────────────────────────────────────
    // Probe every protocol against this row's URL/key, apply the winner and
    // show the evidence behind the choice.
    async detectTargetProtocol(row) {
        const btn = row.querySelector('.detect-protocol');
        const apiUrl = row.querySelector('.target-apiurl').value.trim();
        if (!apiUrl) {
            this.showToast(i18n.t('urlEmpty'), 'error');
            return;
        }
        const apiKey = row.querySelector('.target-apikey').value;
        const firstModel = row.querySelector('.target-models').value
            .split('\n').map(s => s.trim()).filter(Boolean)[0] || '';

        if (btn) { btn.disabled = true; btn.textContent = i18n.t('detecting'); }
        try {
            const result = await APIHandler.detectProtocol(apiUrl, apiKey, firstModel, { timeoutMs: 8000 });
            if (result.best) {
                const sel = row.querySelector('.target-protocol');
                sel.value = result.best;
                sel.dispatchEvent(new Event('change'));
                this.showToast(i18n.t('protocolDetected', { label: APIHandler.getProtocol(result.best).label }), 'success');
            } else {
                this.showToast(i18n.t('protocolNotDetected'), 'error');
            }
            this.showDetectResults(result);
        } catch (err) {
            this.showToast(i18n.t('protocolNotDetected') + ': ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = i18n.t('detectProtocol'); }
        }
    }

    showDetectResults(result) {
        const list = document.getElementById('detectList');
        if (!list) return;
        list.innerHTML = result.results.map(r => `
            <div class="detect-row${r.protocol === result.best ? ' is-best' : ''}">
                <span class="detect-label">${this.escapeHtml(r.label)}${r.protocol === result.best ? '<span class="detect-pick">✓</span>' : ''}</span>
                <span class="badge ${r.ok ? 'badge-success' : r.score >= 3 ? 'badge-warning' : 'badge-neutral'}">${this.escapeHtml(this.detectVerdict(r))}</span>
                <span class="detect-detail">${this.escapeHtml(this.detectDetail(r))}</span>
            </div>`).join('');
        const dialog = document.getElementById('detectDialog');
        if (dialog && !dialog.open) dialog.showModal();
    }

    detectVerdict(result) {
        if (result.ok) return i18n.t('detectOk');
        return result.score >= 3 ? i18n.t('detectPartial') : i18n.t('detectNone');
    }

    detectDetail(result) {
        const parts = [];
        if (Number.isFinite(result.modelsStatus)) {
            parts.push(`${i18n.t('detectStageModels')} HTTP ${result.modelsStatus}`);
        }
        if (Number.isFinite(result.chatStatus)) {
            parts.push(`${i18n.t('detectStageChat')} HTTP ${result.chatStatus}`);
        }
        if (result.reason && result.reason !== 'models') {
            const key = 'detectReason' + result.reason.charAt(0).toUpperCase() + result.reason.slice(1);
            const text = i18n.t(key);
            if (text !== key) parts.push(text);
        }
        parts.push(i18n.t(result.usingDefaultModel ? 'detectDefaultModel' : 'detectTrialModel', { model: result.model }));
        return parts.join(' · ');
    }

    // A run still shutting down (Stop pressed) must settle before a new one starts;
    // a genuinely live run is refused. Returns true when it is safe to start.
    async waitForPreviousRun() {
        if (!this.isRunning) {
            if (this.currentRunPromise) {
                try { await this.currentRunPromise; } catch (_) { /* already surfaced */ }
            }
            return true;
        }
        const aborting = this.abortController && this.abortController.signal.aborted;
        if (!aborting) return false;
        if (this.currentRunPromise) {
            try { await this.currentRunPromise; } catch (_) { /* already surfaced */ }
        }
        return !this.isRunning;
    }

    async startTests() {
        if (!await this.waitForPreviousRun()) {
            this.showToast(i18n.t('runInProgress'), 'error');
            return;
        }

        const config = this.getConfig();
        const errors = this.validateConfig(config);
        if (errors.length > 0) {
            errors.forEach(msg => this.showToast(msg, 'error'));
            this.expandConfigPanel();
            return;
        }

        const myRun = ++this.runId;
        this.runConfigSnapshot = config;
        this.testResults = [];
        this.clearResultsDom();

        const tasks = this.buildTasks(config);
        this.totalPlanned = tasks.length;
        this.completedCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.cancelledCount = 0;

        this.beginRun();

        this.currentRunPromise = this.executeTasks(tasks, config.concurrency, myRun);
        try {
            await this.currentRunPromise;
        } finally {
            this.currentRunPromise = null;
        }
    }

    async retryFailed() {
        if (!await this.waitForPreviousRun()) {
            this.showToast(i18n.t('runInProgress'), 'error');
            return;
        }

        const config = this.runConfigSnapshot || this.getConfig();
        const failed = this.testResults.filter(r => r.status === 'failed' || r.status === 'cancelled');
        if (failed.length === 0) { this.showToast(i18n.t('noFailedTests'), 'info'); return; }

        const seen = new Set();
        const tasks = [];
        for (const r of failed) {
            const key = `${r.model}|||${r.target}|||${r.prompt}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const target = (config.targets || []).find(t => this.targetLabel(t) === r.target);
            if (!target) continue;
            tasks.push({
                handler: this.createHandler(target, config),
                model: r.model,
                prompt: r.prompt,
                round: r.round,
                label: r.target
            });
        }
        if (tasks.length === 0) { this.showToast(i18n.t('noFailedTests'), 'error'); return; }

        const myRun = ++this.runId;
        this.totalPlanned = (this.totalPlanned || 0) + tasks.length;
        this.beginRun();
        this.showToast(i18n.t('retryStarted'), 'info');

        this.currentRunPromise = this.executeTasks(tasks, config.concurrency, myRun);
        try {
            await this.currentRunPromise;
        } finally {
            this.currentRunPromise = null;
        }
    }

    beginRun() {
        this.isRunning = true;
        this.abortController = new AbortController();
        this.updateRunControls(true);
        this.addBeforeUnload();
        this.setActiveTab('live');
        this.updateRunProgress();
    }

    async executeTasks(tasks, concurrency, myRun) {
        const signal = this.abortController.signal;
        let index = 0;
        const nextIndex = () => index++;
        const workerCount = this.clamp(concurrency || 1, 1, 10);
        const workers = [];
        for (let i = 0; i < workerCount; i++) {
            workers.push(this.runWorker(tasks, nextIndex, signal, myRun));
        }
        try {
            await Promise.all(workers);
        } catch (err) {
            console.error('Test execution failed:', err);
            this.showToast(i18n.t('testFailed') + ': ' + err.message, 'error');
        } finally {
            if (this.runId === myRun) {
                this.isRunning = false;
                this.abortController = null;
                this.updateRunControls(false);
                this.removeBeforeUnload();
                if (this.completedCount > 0) this.generateStatistics();
                if (this.failedCount === 0 && this.cancelledCount === 0 && this.completedCount > 0) {
                    this.showToast(i18n.t('testCompleted'), 'success');
                }
                this.setActiveTab('results');
            }
        }
    }

    async runWorker(tasks, nextIndex, signal, myRun) {
        while (this.runId === myRun && !signal.aborted) {
            const idx = nextIndex();
            if (idx >= tasks.length) break;
            const task = tasks[idx];
            if (this.runId !== myRun) break;

            const record = this.createResultRecord(task.model, task.label, task.prompt, task.round);
            this.testResults.push(record);
            this.pinnedTestId = record.testId;
            this.renderResults();
            this.updateLivePanel(record);

            try {
                const result = await task.handler.testModel(task.model, task.prompt, (progress) => {
                    if (this.runId !== myRun) return;
                    this.applyProgress(record, progress);
                }, signal);
                if (this.runId !== myRun) return;
                this.applyProgress(record, result);
                this.countResult(record.status);
            } catch (err) {
                if (this.runId !== myRun) return;
                record.error = (err && err.message) || String(err);
                record.status = 'failed';
                record.errorType = this.classifyError(record.error);
                record.tpot = null;
                this.updateRowCells(record);
                this.countResult('failed');
            }
            this.updateRunProgress();
        }
    }

    stopTests() {
        if (!this.isRunning || !this.abortController) return;
        this.abortController.abort('user');
        this.showToast(i18n.t('runCancelled'), 'info');
        const stopBtn = document.getElementById('stopTest');
        if (stopBtn) stopBtn.disabled = true;
    }

    updateRunControls(running) {
        const start = document.getElementById('startTest');
        const stop = document.getElementById('stopTest');
        if (start) {
            start.disabled = running;
            start.textContent = i18n.t('startTest');
            start.classList.toggle('testing-state', running);
        }
        if (stop) {
            stop.disabled = false;
            stop.classList.toggle('hidden', !running);
        }
    }

    updateRunProgress() {
        const bar = document.getElementById('runProgressBar');
        const text = document.getElementById('runProgressText');
        const planned = this.totalPlanned || 0;
        const done = this.completedCount || 0;
        const pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
        if (bar) bar.style.width = `${pct}%`;
        if (text) {
            text.textContent = `${done} / ${planned} · ${pct}% · ✓${this.successCount} ✗${this.failedCount} ⊘${this.cancelledCount}`;
        }
    }

    addBeforeUnload() {
        if (this._beforeUnload) return;
        this._beforeUnload = (ev) => {
            if (!this.isRunning) return;
            ev.preventDefault();
            ev.returnValue = '';
        };
        window.addEventListener('beforeunload', this._beforeUnload);
    }

    removeBeforeUnload() {
        if (!this._beforeUnload) return;
        window.removeEventListener('beforeunload', this._beforeUnload);
        this._beforeUnload = null;
    }

    // ── Result records ──────────────────────────────────────────────────────
    createResultRecord(model, target, prompt, round) {
        return {
            testId: `test_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            model,
            target,
            prompt,
            round,
            firstTokenTime: null,
            outputSpeed: 0,
            totalTokens: 0,
            totalLatency: null,
            tokenTimes: null,
            finishReason: null,
            inputTokens: null,
            usage: null,
            tpot: null,
            errorType: null,
            result: '',
            error: null,
            status: 'testing'
        };
    }

    applyProgress(record, data) {
        if (data.firstTokenTime !== undefined) record.firstTokenTime = data.firstTokenTime;
        if (data.outputSpeed !== undefined && data.outputSpeed !== null) {
            record.outputSpeed = parseFloat(data.outputSpeed) || 0;
        }
        if (data.totalTokens !== undefined && data.totalTokens !== null) record.totalTokens = data.totalTokens;
        if (data.totalLatency !== undefined && data.totalLatency !== null) record.totalLatency = data.totalLatency;
        if (Array.isArray(data.tokenTimes)) record.tokenTimes = data.tokenTimes;
        if (data.finishReason !== undefined) record.finishReason = data.finishReason;
        if (data.inputTokens !== undefined && data.inputTokens !== null) record.inputTokens = data.inputTokens;
        if (data.usage !== undefined) record.usage = data.usage;
        if (data.result !== undefined) record.result = data.result || '';
        if (data.error !== undefined) record.error = data.error || null;
        if (data.status) record.status = data.status;

        record.errorType = record.error ? this.classifyError(record.error) : null;
        if (record.status === 'testing' || record.status === 'cancelled') {
            record.tpot = null;
        } else {
            record.tpot = this.computeTpot(record.totalLatency, record.firstTokenTime, record.totalTokens);
        }

        this.updateRowCells(record);
        if (this.pinnedTestId === record.testId) this.updateLivePanel(record);
    }

    countResult(status) {
        this.completedCount++;
        if (status === 'completed') this.successCount++;
        else if (status === 'cancelled') this.cancelledCount++;
        else this.failedCount++;
        this.updateRunProgress();
    }

    // ── Results rendering ───────────────────────────────────────────────────
    sortValue(record, key) {
        switch (key) {
            case 'firstToken': return record.firstTokenTime ?? null;
            case 'speed': return record.outputSpeed ?? null;
            case 'round': return record.round ?? null;
            case 'status': return record.status || '';
            default: return record[key] != null ? record[key] : null;
        }
    }

    visibleResults() {
        let rows = this.testResults;
        if (this.filterStatus !== 'all') {
            rows = rows.filter(r => r.status === this.filterStatus);
        }
        const q = this.filterQuery.trim().toLowerCase();
        if (q) {
            rows = rows.filter(r => [r.model, r.target, r.prompt, r.error]
                .some(v => String(v || '').toLowerCase().includes(q)));
        }
        if (this.sortKey) {
            const key = this.sortKey;
            const dir = this.sortDir;
            rows = rows.slice().sort((a, b) => {
                const av = this.sortValue(a, key);
                const bv = this.sortValue(b, key);
                if (av === null && bv === null) return 0;
                if (av === null) return 1;      // nulls last, whatever the direction
                if (bv === null) return -1;
                if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
                return String(av).localeCompare(String(bv)) * dir;
            });
        }
        return rows;
    }

    toggleSort(key) {
        if (this.sortKey === key) this.sortDir = -this.sortDir;
        else { this.sortKey = key; this.sortDir = 1; }
        this.renderResults();
    }

    statusBadgeHtml(status) {
        switch (status) {
            case 'completed':
                return `<span class="badge badge-success">✓ ${this.escapeHtml(i18n.t('completed'))}</span>`;
            case 'failed':
                return `<span class="badge badge-danger">✗ ${this.escapeHtml(i18n.t('failed'))}</span>`;
            case 'cancelled':
                return `<span class="badge badge-warning">⊘ ${this.escapeHtml(i18n.t('cancelled'))}</span>`;
            default:
                return `<span class="badge badge-neutral"><span class="status-dot pulse"></span> ${this.escapeHtml(i18n.t('statusTesting'))}</span>`;
        }
    }

    resultRowHtml(record) {
        const testing = record.status === 'testing';
        const resultText = this.truncate(record.result, 160);
        const errorText = record.error ? this.truncate(record.error, 80) : '';
        return `<tr data-test-id="${record.testId}">
            <td class="cell-model" title="${this.escapeHtml(record.model)}">${this.escapeHtml(record.model)}</td>
            <td class="cell-target" title="${this.escapeHtml(record.target)}">${this.escapeHtml(this.truncate(record.target, 40))}</td>
            <td class="cell-prompt" title="${this.escapeHtml(record.prompt)}">${this.escapeHtml(this.truncate(record.prompt, 50))}</td>
            <td class="cell-round">${this.escapeHtml(String(record.round))}</td>
            <td class="cell-first-token">${record.firstTokenTime != null ? this.escapeHtml(record.firstTokenTime + 'ms') : '-'}</td>
            <td class="cell-speed">${record.outputSpeed ? this.escapeHtml(Number(record.outputSpeed).toFixed(2)) : '-'}</td>
            <td class="cell-result">${this.escapeHtml(resultText)}</td>
            <td class="cell-error">${errorText ? this.escapeHtml(errorText) : '-'}</td>
            <td class="cell-status">${this.statusBadgeHtml(record.status)}</td>
            <td class="cell-actions">
                <button type="button" class="btn btn-ghost btn-sm view-btn" data-test-id="${record.testId}">${this.escapeHtml(i18n.t('viewResult'))}</button>
                <button type="button" class="btn btn-ghost btn-sm del-btn" data-test-id="${record.testId}"${this.isRunning ? ' disabled' : ''}>${this.escapeHtml(i18n.t('deleteRow'))}</button>
            </td>
        </tr>`;
    }

    renderResults() {
        const body = document.getElementById('resultsBody');
        if (!body) return;
        const rows = this.visibleResults();
        body.innerHTML = rows.map(r => this.resultRowHtml(r)).join('');
        this.updateResultEmptyState(rows.length);
        this.updateSortIndicators();
        if (this.pinnedTestId) {
            const pinned = this.testResults.find(r => r.testId === this.pinnedTestId);
            if (pinned) this.updateLivePanel(pinned);
        }
    }

    updateSortIndicators() {
        document.querySelectorAll('#resultsTable thead th[data-sort]').forEach(th => {
            const key = th.dataset.sort;
            const label = i18n.t(th.getAttribute('data-i18n'));
            th.textContent = this.sortKey === key ? `${label} ${this.sortDir === 1 ? '↑' : '↓'}` : label;
            th.setAttribute('aria-sort', this.sortKey === key
                ? (this.sortDir === 1 ? 'ascending' : 'descending') : 'none');
        });
    }

    updateResultEmptyState(visibleCount) {
        const empty = document.getElementById('resultsEmpty');
        const scroll = document.getElementById('resultsTable')?.closest('.table-scroll');
        if (!empty || !scroll) return;
        const total = this.testResults.length;
        if (total === 0) {
            empty.textContent = i18n.t('emptyResults');
            empty.classList.remove('hidden');
            scroll.classList.add('hidden');
            return;
        }
        if (visibleCount === 0) {
            empty.textContent = i18n.t('noSearchResults');
            empty.classList.remove('hidden');
            scroll.classList.add('hidden');
            return;
        }
        empty.classList.add('hidden');
        scroll.classList.remove('hidden');
    }

    updateRowCells(record) {
        const row = document.querySelector(`#resultsBody tr[data-test-id="${record.testId}"]`);
        if (!row) return;
        const setText = (selector, value) => {
            const cell = row.querySelector(selector);
            if (cell) cell.textContent = value;
        };
        setText('.cell-first-token', record.firstTokenTime != null ? record.firstTokenTime + 'ms' : '-');
        setText('.cell-speed', record.outputSpeed ? Number(record.outputSpeed).toFixed(2) : '-');

        const resultCell = row.querySelector('.cell-result');
        if (resultCell) {
            resultCell.textContent = this.truncate(record.result, 160);
            if (record.status !== 'testing') resultCell.title = record.result || '';
        }
        const errorCell = row.querySelector('.cell-error');
        if (errorCell) {
            errorCell.textContent = record.error ? this.truncate(record.error, 80) : '-';
            if (record.status !== 'testing') errorCell.title = record.error || '';
        }
        const statusCell = row.querySelector('.cell-status');
        if (statusCell) statusCell.innerHTML = this.statusBadgeHtml(record.status);

        const del = row.querySelector('.del-btn');
        if (del) del.disabled = this.isRunning;
    }

    clearResultsDom() {
        const body = document.getElementById('resultsBody');
        if (body) body.innerHTML = '';
        const statsBody = document.getElementById('statisticsBody');
        if (statsBody) statsBody.innerHTML = '';
        const statsScroll = document.getElementById('statisticsTable')?.closest('.table-scroll');
        if (statsScroll) statsScroll.classList.add('hidden');
        const statsEmpty = document.getElementById('statisticsEmpty');
        if (statsEmpty) statsEmpty.classList.remove('hidden');
        this.pinnedTestId = null;
        this.updateLivePanel(null);
        this.updateResultEmptyState(0);
        this.updateRunProgress();
    }

    onViewClick(testId) {
        const record = this.testResults.find(r => r.testId === testId);
        if (!record) return;
        if (record.status === 'testing') {
            this.pinnedTestId = testId;
            this.updateLivePanel(record);
            this.setActiveTab('live');
            return;
        }
        this.openDetail(record);
    }

    deleteResultRow(testId) {
        if (this.isRunning) { this.showToast(i18n.t('stopFirst'), 'error'); return; }
        const idx = this.testResults.findIndex(r => r.testId === testId);
        if (idx < 0) return;
        this.testResults.splice(idx, 1);
        if (this.pinnedTestId === testId) this.pinnedTestId = null;
        this.renderResults();
        this.displayStatistics(this.testResults.length ? this.computeStatistics() : {});
    }

    async clearResults() {
        if (this.isRunning) { this.showToast(i18n.t('stopFirst'), 'error'); return; }
        if (!await this.askConfirm(i18n.t('confirmClearResults'))) return;
        this.testResults = [];
        this.totalPlanned = 0;
        this.completedCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.cancelledCount = 0;
        this.clearResultsDom();
        this.displayStatistics({});
    }

    // ── Live panel + detail dialog ──────────────────────────────────────────
    updateLivePanel(record) {
        const placeholder = document.getElementById('livePlaceholder');
        const content = document.getElementById('liveContent');
        if (!placeholder || !content) return;
        if (!record) {
            placeholder.classList.remove('hidden');
            content.classList.add('hidden');
            return;
        }
        placeholder.classList.add('hidden');
        content.classList.remove('hidden');

        this.setText('liveModel', record.model || '-');
        this.setText('liveRound', record.round != null ? `${i18n.t('round')} ${record.round}` : '-');
        const badge = document.getElementById('liveStatus');
        if (badge) {
            const cls = record.status === 'completed' ? 'badge-success'
                : record.status === 'failed' ? 'badge-danger'
                    : record.status === 'cancelled' ? 'badge-warning' : 'badge-neutral';
            badge.className = `badge ${cls}`;
            badge.textContent = i18n.t(record.status || 'testing');
        }
        this.setText('livePrompt', record.prompt || '');
        const res = document.getElementById('liveResult');
        if (res) {
            res.textContent = record.result || '';
            res.scrollTop = res.scrollHeight;
        }
        this.setText('liveFirstToken', record.firstTokenTime != null ? record.firstTokenTime + ' ms' : '-');
        this.setText('liveSpeed', record.outputSpeed ? Number(record.outputSpeed).toFixed(2) : '-');
        this.setText('liveTokens', record.totalTokens ? String(record.totalTokens) : '-');
    }

    openDetail(record) {
        const dialog = document.getElementById('detailDialog');
        if (!dialog || !record) return;
        this.setText('detailModel', record.model || '-');
        this.setText('detailRound', record.round != null ? `${i18n.t('round')} ${record.round}` : '-');
        this.setText('detailStatus', i18n.t(record.status || 'testing'));
        this.setText('detailPrompt', record.prompt || '-');
        this.setText('detailResult', record.result || '');
        this.setText('detailFirstToken', record.firstTokenTime != null ? record.firstTokenTime + ' ms' : '-');
        this.setText('detailSpeed', record.outputSpeed ? Number(record.outputSpeed).toFixed(2) + ' t/s' : '-');
        this.setText('detailTokens',
            record.usage?.output != null ? String(record.usage.output) : (record.totalTokens || '-'));

        const err = document.getElementById('detailError');
        if (err) {
            let msg = record.error || '';
            if (msg && record.errorType === 'timeout') msg += ' — ' + i18n.t('requestTimeoutHint');
            err.textContent = msg;
            err.classList.toggle('hidden', !msg);
        }
        this.lastDialogTrigger = document.activeElement;
        dialog.showModal();
    }

    // ── Statistics ──────────────────────────────────────────────────────────
    percentile(arr, p) {
        if (!arr || arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }

    computeTpot(totalLatency, firstTokenTime, tokens) {
        if (!totalLatency || !firstTokenTime || !tokens || tokens < 2 || totalLatency <= firstTokenTime) return null;
        return (totalLatency - firstTokenTime) / (tokens - 1);
    }

    classifyError(msg) {
        const m = String(msg || '');
        const st = m.match(/HTTP (\d{3})/);
        if (/cancel/i.test(m) && !st) return 'cancelled';
        if (st) {
            const c = +st[1];
            if (c === 429) return 'rate_limit';
            if (c === 401) return 'unauthorized';
            if (c === 403) return 'forbidden';
            if (c === 400) return 'bad_request';
            if (c === 408) return 'timeout';
            if (c === 503) return 'service_unavailable';
            if (c >= 500) return 'server_error';
            return 'http';
        }
        if (/failed to fetch|networkerror|network error|err_connection|err_name|err_internet/i.test(m)) return 'network';
        if (/timed? ?out|timeout/i.test(m)) return 'timeout';
        return 'other';
    }

    errorTypeLabel(type, message) {
        if (type === 'http') {
            const m = String(message || '').match(/HTTP (\d{3})/);
            return i18n.t('err_http', { code: m ? m[1] : '?' });
        }
        return i18n.t('err_' + (type || 'other'));
    }

    parsePriceMap() {
        const map = {};
        (document.getElementById('modelPrices')?.value || '').split('\n').forEach(line => {
            const m = line.trim().match(/^(.+?)\s*=\s*([\d.]+)\s*,\s*([\d.]+)\s*$/);
            if (m) map[m[1].trim().toLowerCase()] = { input: parseFloat(m[2]), output: parseFloat(m[3]) };
        });
        return map;
    }

    computeCost(model, inputTokens, outputTokens) {
        const p = this.parsePriceMap()[String(model || '').toLowerCase()];
        if (!p) return null;
        return ((inputTokens || 0) / 1e6) * p.input + ((outputTokens || 0) / 1e6) * p.output;
    }

    computeStatistics() {
        const stats = {};
        this.testResults.forEach(r => {
            const key = `${r.model}|||${r.target || ''}`;
            if (!stats[key]) {
                stats[key] = {
                    model: r.model, target: r.target || '',
                    firstTokenTimes: [], outputSpeeds: [], totalLatencies: [], tpots: [], tokenTimesList: [],
                    costs: [], prefillTps: [], inputTokensArr: [], outputTokensArr: [],
                    totalTests: 0, successfulTests: 0, failedTests: 0, cancelledTests: 0,
                    totalTokens: 0, errorTypes: {}
                };
            }
            const s = stats[key];

            if (r.status === 'cancelled') {
                // Cancelled runs never enter the success/failure denominator.
                s.cancelledTests++;
                return;
            }

            if (r.status === 'completed' && !r.error) {
                s.totalTests++;
                s.successfulTests++;
                if (r.firstTokenTime && r.firstTokenTime > 0) s.firstTokenTimes.push(r.firstTokenTime);
                if (r.outputSpeed && r.outputSpeed > 0) s.outputSpeeds.push(r.outputSpeed);
                if (r.totalLatency && r.totalLatency > 0) s.totalLatencies.push(r.totalLatency);
                if (r.tpot && r.tpot > 0) s.tpots.push(r.tpot);
                if (Array.isArray(r.tokenTimes) && r.tokenTimes.length > 1) s.tokenTimesList.push(r.tokenTimes);
                if (r.totalTokens) s.totalTokens += r.totalTokens;

                if (r.inputTokens != null && r.firstTokenTime > 0) {
                    const prefill = r.inputTokens / (r.firstTokenTime / 1000);
                    if (prefill > 0) s.prefillTps.push(prefill);
                }
                if (r.inputTokens != null) s.inputTokensArr.push(r.inputTokens);
                s.outputTokensArr.push(r.usage?.output ?? r.totalTokens ?? 0);

                const outputSide = (r.usage?.output ?? r.totalTokens ?? 0) + (r.usage?.thoughts ?? 0);
                const cost = this.computeCost(r.model, r.inputTokens ?? null, outputSide);
                if (cost != null) s.costs.push(cost);
            } else {
                s.totalTests++;
                s.failedTests++;
                const t = r.errorType || 'other';
                s.errorTypes[t] = (s.errorTypes[t] || 0) + 1;
            }
        });
        return stats;
    }

    aggregateGroup(s) {
        const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
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
        const costSum = s.costs.length ? s.costs.reduce((a, b) => a + b, 0) : 0;
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
            totalCost: s.costs.length ? costSum : null,
            avgCost: avg(s.costs),
            tokensPerDollar: (s.costs.length && s.totalTokens && costSum > 0) ? s.totalTokens / costSum : null,
            errorRate: s.totalTests > 0 ? (s.failedTests / s.totalTests) * 100 : 0,
            errorDist: s.errorTypes || {},
            successRate: s.totalTests > 0 ? (s.successfulTests / s.totalTests) * 100 : 0
        };
    }

    displayStatistics(stats) {
        const body = document.getElementById('statisticsBody');
        if (!body) return;
        const scroll = document.getElementById('statisticsTable')?.closest('.table-scroll');
        const empty = document.getElementById('statisticsEmpty');
        const keys = Object.keys(stats || {});

        body.innerHTML = '';
        if (keys.length === 0) {
            if (scroll) scroll.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');
        if (scroll) scroll.classList.remove('hidden');

        const fmtMs = v => (v !== null && v !== undefined) ? v.toFixed(2) : '-';
        const fmtSpeed = v => (v !== null && v !== undefined) ? v.toFixed(2) : '-';

        keys.forEach(key => {
            const s = stats[key];
            const g = this.aggregateGroup(s);
            const sr = g.successRate.toFixed(1);
            const dist = Object.entries(g.errorDist || {})
                .map(([k, v]) => `${this.errorTypeLabel(k, this.testResults.find(r => r.errorType === k)?.error)}×${v}`)
                .join(', ');
            const itlTitle = g.itlP90 !== null
                ? `${i18n.t('tooltipStalls')}: ${g.itlStalls} · avg ${g.itlAvg !== null ? g.itlAvg.toFixed(0) : '-'}ms · max ${g.itlMax !== null ? g.itlMax.toFixed(0) : '-'}ms — ${i18n.t('chunkInterval')}`
                : '';
            const srTitle = dist ? `${i18n.t('errorRate')} ${g.errorRate.toFixed(1)}%: ${dist}` : '';
            const costTitle = g.avgCost !== null
                ? `total $${(g.totalCost ?? 0).toFixed(6)} · ${i18n.t('tokensPerDollar')}: ${g.tokensPerDollar !== null ? g.tokensPerDollar.toFixed(0) : '-'}`
                : '';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="stats-model" title="${this.escapeHtml(s.model)}">${this.escapeHtml(s.model)}</td>
                <td class="stats-target" title="${this.escapeHtml(s.target)}">${this.escapeHtml(this.truncate(s.target, 30))}</td>
                <td>${fmtMs(g.avgFirstToken)}</td>
                <td>${fmtMs(g.p50FirstToken)}</td>
                <td>${fmtMs(g.p90FirstToken)}</td>
                <td>${fmtMs(g.p95FirstToken)}</td>
                <td>${fmtMs(g.p99FirstToken)}</td>
                <td>${fmtMs(g.avgTotalLatency)}</td>
                <td>${fmtSpeed(g.avgOutputSpeed)}</td>
                <td>${fmtSpeed(g.p50Speed)}</td>
                <td>${fmtSpeed(g.p90Speed)}</td>
                <td>${fmtMs(g.avgTpot)}</td>
                <td title="${this.escapeHtml(itlTitle)}">${fmtMs(g.itlP90)}</td>
                <td>${g.avgPrefillTps !== null ? g.avgPrefillTps.toFixed(0) : '-'}</td>
                <td>${s.totalTokens}</td>
                <td title="${this.escapeHtml(costTitle)}">${g.avgCost !== null ? '$' + g.avgCost.toFixed(6) : '-'}</td>
                <td class="stats-success-rate" data-rate="${this.escapeHtml(sr)}" title="${this.escapeHtml(srTitle)}">${sr}%</td>
            `;
            body.appendChild(row);
        });
    }

    generateStatistics() {
        if (this.testResults.length === 0) {
            this.displayStatistics({});
            return;
        }
        this.displayStatistics(this.computeStatistics());
        this.saveHistoryRecord();
    }

    // ── History ─────────────────────────────────────────────────────────────
    getHistoryRecords() {
        try {
            const raw = localStorage.getItem(STORAGE_HISTORY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    writeHistoryRecords(records) {
        try {
            localStorage.setItem(STORAGE_HISTORY, JSON.stringify(records.slice(0, MAX_HISTORY)));
        } catch (err) {
            console.warn('Failed to save history:', err);
        }
    }

    saveHistoryRecord() {
        try {
            const snapshot = this.runConfigSnapshot || this.getConfig();
            const stats = this.computeStatistics();
            const record = {
                schema: 2,
                timestamp: new Date().toISOString(),
                config: this.stripKeys(snapshot),
                summary: {
                    totalTests: this.testResults.length,
                    successfulTests: this.testResults.filter(r => r.status === 'completed' && !r.error).length,
                    cancelledTests: this.testResults.filter(r => r.status === 'cancelled').length,
                    totalModels: Object.keys(stats).length
                },
                modelStats: {}
            };
            Object.keys(stats).forEach(key => {
                const s = stats[key];
                const g = this.aggregateGroup(s);
                record.modelStats[key] = {
                    model: s.model, target: s.target,
                    avgFirstTokenTime: g.avgFirstToken,
                    p95FirstToken: g.p95FirstToken, p99FirstToken: g.p99FirstToken,
                    avgTotalLatency: g.avgTotalLatency, avgOutputSpeed: g.avgOutputSpeed,
                    avgTpot: g.avgTpot, itlP90: g.itlP90,
                    errorRate: g.errorRate, errorDist: g.errorDist,
                    successRate: g.successRate, totalTests: s.totalTests,
                    successfulTests: s.successfulTests, cancelledTests: s.cancelledTests,
                    totalTokens: s.totalTokens
                };
            });
            const existing = this.getHistoryRecords();
            existing.unshift(record);
            this.writeHistoryRecords(existing);
            this.renderHistoryRecords();
        } catch (err) {
            console.warn('Failed to save history:', err);
        }
    }

    historyRowHtml(stat) {
        const fmtMs = v => (v !== null && v !== undefined) ? v.toFixed(2) + 'ms' : '-';
        const sr = Number.isFinite(stat?.successRate) ? stat.successRate.toFixed(1) + '%' : '-';
        return `<tr>
            <td>${this.escapeHtml(stat?.model ?? '-')}</td>
            <td class="history-target" title="${this.escapeHtml(stat?.target ?? '')}">${this.escapeHtml(stat?.target ?? '-')}</td>
            <td>${fmtMs(stat?.avgFirstTokenTime)}</td>
            <td>${stat?.avgOutputSpeed != null ? stat.avgOutputSpeed.toFixed(2) : '-'}</td>
            <td>${fmtMs(stat?.avgTpot)}</td>
            <td>${fmtMs(stat?.itlP90)}</td>
            <td>${stat?.totalTokens ?? '-'}</td>
            <td>${sr}</td>
        </tr>`;
    }

    historyCardHtml(record, index, locale) {
        const summary = record?.summary || {};
        const total = Number(summary.totalTests) || 0;
        const ok = Number(summary.successfulTests) || 0;
        const rate = total > 0 ? (ok / total * 100).toFixed(1) + '%' : '-';
        const ts = new Date(record?.timestamp);
        const dateLabel = Number.isNaN(ts.getTime())
            ? (record?.testDate || '-')
            : ts.toLocaleString(locale);

        let targetList = '';
        if (Array.isArray(record?.config?.targets)) {
            targetList = record.config.targets
                .filter(t => t && t.enabled !== false)
                .map(t => this.targetLabel(t))
                .join(', ');
        } else if (Array.isArray(record?.targets)) {
            targetList = record.targets.join(', ');
        }

        const rows = Object.values(record?.modelStats || {})
            .map(stat => {
                try { return this.historyRowHtml(stat); } catch (_) { return ''; }
            })
            .join('');

        return `<article class="history-card" data-index="${index}">
            <header class="history-head">
                <div>
                    <h3>${this.escapeHtml(i18n.t('record'))} #${index + 1}</h3>
                    <p class="history-date"><span>${this.escapeHtml(i18n.t('testDate'))}: </span>${this.escapeHtml(dateLabel)}</p>
                </div>
                <div class="history-actions">
                    ${record?.config ? `<button type="button" class="btn btn-ghost btn-sm rerun-btn" data-index="${index}">${this.escapeHtml(i18n.t('rerunFromRecord'))}</button>` : ''}
                    <button type="button" class="btn btn-ghost btn-sm delete-history-btn" data-index="${index}">${this.escapeHtml(i18n.t('deleteHistoryRecord'))}</button>
                </div>
            </header>
            <div class="history-summary">
                <span><strong>${this.escapeHtml(i18n.t('totalModels'))}:</strong> ${summary.totalModels ?? '-'}</span>
                <span><strong>${this.escapeHtml(i18n.t('totalTests'))}:</strong> ${total}</span>
                <span><strong>${this.escapeHtml(i18n.t('successfulTests'))}:</strong> ${ok}</span>
                <span><strong>${this.escapeHtml(i18n.t('cancelledTests'))}:</strong> ${Number(summary.cancelledTests) || 0}</span>
                <span><strong>${this.escapeHtml(i18n.t('successRate'))}:</strong> ${rate}</span>
            </div>
            ${targetList ? `<div class="history-summary"><span><strong>${this.escapeHtml(i18n.t('apiEndpoint'))}:</strong> ${this.escapeHtml(targetList)}</span></div>` : ''}
            <div class="table-scroll">
                <table class="history-table">
                    <thead><tr>
                        <th scope="col">${this.escapeHtml(i18n.t('model'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('target'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('averageFirstToken'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('averageOutputSpeed'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('tpot'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('itlP90'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('totalTokens'))}</th>
                        <th scope="col">${this.escapeHtml(i18n.t('successRate'))}</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </article>`;
    }

    renderHistoryRecords() {
        const list = document.getElementById('historyList');
        if (!list) return;
        const records = this.getHistoryRecords();
        if (records.length === 0) {
            list.innerHTML = `<p class="empty-state">${this.escapeHtml(i18n.t('historyEmpty'))}</p>`;
            return;
        }
        const locale = i18n.currentLanguage === 'zh' ? 'zh-CN' : 'en-US';
        list.innerHTML = records.map((record, index) => {
            try {
                return this.historyCardHtml(record, index, locale);
            } catch (err) {
                console.warn('Skipping damaged history record', index, err);
                return '';
            }
        }).join('');
    }

    async deleteHistoryRecord(index) {
        const records = this.getHistoryRecords();
        if (!records[index]) return;
        if (!await this.askConfirm(i18n.t('confirmDeleteHistory'))) return;
        records.splice(index, 1);
        this.writeHistoryRecords(records);
        this.renderHistoryRecords();
    }

    async clearHistory() {
        if (!await this.askConfirm(i18n.t('confirmClearHistory'))) return;
        localStorage.removeItem(STORAGE_HISTORY);
        this.renderHistoryRecords();
        this.showToast(i18n.t('historyCleared'), 'success');
    }

    rerunFromRecord(index) {
        const record = this.getHistoryRecords()[index];
        if (!record || !record.config) return;
        this.applyImportedConfig(record.config);
        this.showToast(i18n.t('configImported'), 'success');
        this.expandConfigPanel();
    }

    exportHistory() {
        const records = this.getHistoryRecords();
        if (records.length === 0) { this.showToast(i18n.t('historyEmpty'), 'info'); return; }
        this.downloadBlob(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }),
            `llm_speedtest_history_${this.todayStamp()}.json`);
    }

    // ── Export helpers ──────────────────────────────────────────────────────
    escapeCsv(value) {
        if (value === null || value === undefined) return '';
        let text = String(value);
        // Prevent spreadsheet formula injection.
        if (/^[=+\-@\t]/.test(text)) text = "'" + text;
        if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
        return text;
    }

    csvDocument(lines) {
        return '\uFEFF' + lines.join('\r\n');
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    exportResults(format) {
        const rows = this.visibleResults();
        if (rows.length === 0) { this.showToast(i18n.t('noResultsToExport'), 'info'); return; }
        const stamp = this.todayStamp();

        if (format === 'json') {
            this.downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }),
                `llm_speedtest_results_${stamp}.json`);
            return;
        }

        const headers = ['model', 'target', 'prompt', 'round', 'firstTokenTime', 'totalLatency', 'outputSpeed',
            'totalTokens', 'result', 'error', 'errorType', 'status'].map(key => this.escapeCsv(i18n.t(key)));
        const lines = [headers.join(',')];
        rows.forEach(r => {
            lines.push([
                r.model, r.target, r.prompt, r.round,
                r.firstTokenTime ?? '', r.totalLatency ?? '', r.outputSpeed ?? '', r.totalTokens ?? '',
                r.result, r.error, r.errorType || '', r.status
            ].map(v => this.escapeCsv(v)).join(','));
        });
        this.downloadBlob(new Blob([this.csvDocument(lines)], { type: 'text/csv;charset=utf-8' }),
            `llm_speedtest_results_${stamp}.csv`);
    }

    exportStatistics() {
        if (this.testResults.length === 0) { this.showToast(i18n.t('noStatsToExport'), 'info'); return; }
        const stats = this.computeStatistics();
        // 23 headers ↔ 23 values, in this exact order.
        const headers = ['model', 'target', 'averageFirstToken', 'p50FirstToken', 'p90FirstToken', 'p95FirstToken',
            'p99FirstToken', 'totalLatency', 'averageOutputSpeed', 'p50Speed', 'p90Speed', 'tpot', 'itlP90', 'itlMax',
            'inputTps', 'totalTokens', 'avgCost', 'tokensPerDollar', 'maxOutputTokens', 'avgInputTokens',
            'avgOutputTokens', 'successRate', 'errorRate'].map(key => this.escapeCsv(i18n.t(key)));
        const lines = [headers.join(',')];

        Object.keys(stats).forEach(key => {
            const s = stats[key];
            const g = this.aggregateGroup(s);
            const dist = Object.entries(g.errorDist || {})
                .map(([k, v]) => `${this.errorTypeLabel(k, this.testResults.find(r => r.errorType === k)?.error)}×${v}`)
                .join(' ');
            const values = [
                s.model, s.target,
                g.avgFirstToken !== null ? g.avgFirstToken.toFixed(2) : '',
                g.p50FirstToken !== null ? g.p50FirstToken.toFixed(2) : '',
                g.p90FirstToken !== null ? g.p90FirstToken.toFixed(2) : '',
                g.p95FirstToken !== null ? g.p95FirstToken.toFixed(2) : '',
                g.p99FirstToken !== null ? g.p99FirstToken.toFixed(2) : '',
                g.avgTotalLatency !== null ? g.avgTotalLatency.toFixed(2) : '',
                g.avgOutputSpeed !== null ? g.avgOutputSpeed.toFixed(2) : '',
                g.p50Speed !== null ? g.p50Speed.toFixed(2) : '',
                g.p90Speed !== null ? g.p90Speed.toFixed(2) : '',
                g.avgTpot !== null ? g.avgTpot.toFixed(2) : '',
                g.itlP90 !== null ? g.itlP90.toFixed(2) : '',
                g.itlMax !== null ? g.itlMax.toFixed(2) : '',
                g.avgPrefillTps !== null ? g.avgPrefillTps.toFixed(0) : '',
                s.totalTokens ?? '',
                g.avgCost !== null ? g.avgCost.toFixed(6) : '',
                g.tokensPerDollar !== null ? g.tokensPerDollar.toFixed(0) : '',
                g.maxOutputTokens ?? '',
                g.avgInputTokens !== null ? g.avgInputTokens.toFixed(0) : '',
                g.avgOutputTokens !== null ? g.avgOutputTokens.toFixed(0) : '',
                g.successRate.toFixed(1),
                (g.errorRate.toFixed(1) + '% ' + dist).trim()
            ];
            lines.push(values.map(v => this.escapeCsv(v)).join(','));
        });

        this.downloadBlob(new Blob([this.csvDocument(lines)], { type: 'text/csv;charset=utf-8' }),
            `llm_speedtest_statistics_${this.todayStamp()}.csv`);
    }

    // ── Toasts + confirm dialog ─────────────────────────────────────────────
    showToast(message, type = 'info') {
        const region = document.getElementById('toastRegion');
        if (!region) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        region.appendChild(toast);
        // Errors carry actionable hints — give them time to be read.
        setTimeout(() => toast.remove(), type === 'error' ? 7000 : 3000);
    }

    askConfirm(message) {
        const dialog = document.getElementById('confirmDialog');
        const msg = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');
        if (!dialog || !okBtn || !cancelBtn) return Promise.resolve(false);
        if (msg) msg.textContent = message;

        return new Promise(resolve => {
            const finish = (value) => {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                dialog.removeEventListener('close', onClose);
                if (dialog.open) dialog.close();
                resolve(value);
            };
            const onOk = () => finish(true);
            const onCancel = () => finish(false);
            const onClose = () => finish(false);
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            dialog.addEventListener('close', onClose);
            dialog.showModal();
        });
    }

    // ── Language refresh ────────────────────────────────────────────────────
    refreshI18n() {
        document.querySelectorAll('#targetList .target-row').forEach(row => {
            this.applyI18n(row);
            this.setTargetDisabled(row, row.classList.contains('target-disabled'));
            const fetchBtn = row.querySelector('.fetch-models-btn');
            if (fetchBtn && !fetchBtn.disabled) fetchBtn.textContent = i18n.t('fetchModels');
        });
        this.updateTargetLabels();
        this.renderResults();
        this.displayStatistics(this.testResults.length ? this.computeStatistics() : {});
        this.renderHistoryRecords();
        const pinned = this.pinnedTestId
            ? this.testResults.find(r => r.testId === this.pinnedTestId)
            : null;
        this.updateLivePanel(pinned || null);
        this.updateRunControls(this.isRunning);
        this.updateRunProgress();
        this.syncConfigToggle();
    }
}

let apiTester;
document.addEventListener('DOMContentLoaded', () => {
    apiTester = new APITester();
    if (typeof window !== 'undefined') window.apiTester = apiTester;
});
