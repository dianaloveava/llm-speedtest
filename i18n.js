// Internationalization support — flat key/value dictionaries, en + zh.
// Every user-visible string lives here; app.js only ever renders i18n.t(...) output.
const translations = {
    en: {
        title: "LLM SpeedTest",
        metaDescription: "LLM SpeedTest — compare first-token latency, throughput and cost across OpenAI, Anthropic, Google, Ollama and Cohere APIs.",
        skipToContent: "Skip to content",
        footer: "LLM SpeedTest - Compare and analyze AI model performance",
        language: "Language",

        // Header / panels
        settings: "Settings",
        viewOnGithub: "View on GitHub",
        testTargets: "Test Targets",
        addTarget: "+ Add Target",
        removeTarget: "Remove",
        duplicateTarget: "Duplicate",
        moveUp: "Move up",
        moveDown: "Move down",
        disableTarget: "Disable",
        enableTarget: "Enable",
        targetProtocol: "Protocol",
        targetApiUrl: "Base URL",
        targetApiKey: "API Key",
        targetModels: "Models (one per line)",
        toggleApiKey: "Toggle API key visibility",
        fetchModels: "Fetch Models",
        fetchingModels: "Fetching...",
        fetchModelsFailed: "Failed to fetch models",
        fetchModelsNetworkHint: "No response reached the browser — check that the service is running and the port is right. If CORS blocked it, the endpoint must return Access-Control-Allow-Origin (page {page} → API {api}).",
        fetchModelsSuccess: "Models fetched",
        noModelsFetched: "No models returned",
        detectProtocol: "Detect protocol",
        detecting: "Detecting...",
        detectTitle: "Protocol detection",
        protocolDetected: "Protocol detected: {label}",
        protocolNotDetected: "No protocol answered — check the URL, key and CORS",
        urlEmpty: "Enter a Base URL first",
        detectOk: "works",
        detectPartial: "partial",
        detectNone: "no answer",
        detectStageModels: "model list",
        detectStageChat: "1-token request",
        detectReasonOk: "expected response",
        detectReasonOkBody: "2xx, unexpected body",
        detectReasonAuth: "auth rejected — route exists",
        detectReasonError: "error shape matches — route exists",
        detectReasonNotFound: "404 — not this protocol",
        detectReasonMethod: "405 — wrong method",
        detectReasonHttp: "HTTP error",
        detectReasonNetwork: "unreachable",
        detectReasonTimeout: "timed out",
        detectTrialModel: "trial model: {model}",
        detectDefaultModel: "default trial model: {model}",
        importConfig: "Import configuration",
        exportConfig: "Export configuration",
        configImported: "Configuration imported",
        configImportFailed: "Import failed: the file is not a valid configuration",
        keysNotExported: "API keys are never exported",
        confirmImportConfig: "Replace the current configuration with the imported file?",

        prompts: "Prompts",
        addPrompt: "+ Add prompt",
        deletePrompt: "Delete prompt",
        restorePrompts: "Restore defaults",
        promptPh: "Prompt text...",

        rounds: "Test Rounds",
        concurrency: "Concurrency",
        advancedSettings: "Advanced Settings",
        maxTokens: "Max Tokens",
        temperature: "Temperature",
        topP: "Top P",
        timeout: "Timeout (s)",
        timeoutHint: "Abort a request after this many seconds",
        requestTimeoutHint: "The request hit the timeout — raise Timeout in Advanced Settings for slow models.",
        systemPrompt: "System Prompt",
        systemPromptPh: "You are a helpful assistant.",
        modelPrices: "Model Prices ($ per 1M tokens)",
        modelPricesPh: "One per line: name=input,output — e.g. gpt-4o=2.5,10",
        startTest: "Start Test",
        stopTest: "Stop",

        // Tabs
        tabLive: "Live",
        tabResults: "Results",
        tabStatistics: "Statistics",
        tabHistory: "History",

        // Live panel
        emptyLive: "No request in flight. Start a test to watch tokens stream in.",
        liveResponse: "Streaming response",

        // Results
        results: "Results",
        model: "Model",
        target: "Target",
        prompt: "Prompt",
        round: "Round",
        firstTokenTime: "First Token (ms)",
        outputSpeed: "Output Speed (t/s)",
        result: "Result",
        error: "Error",
        status: "Status",
        actions: "Actions",
        viewResult: "View",
        deleteRow: "Delete",
        searchResults: "Search results...",
        statusAll: "All statuses",
        statusCompleted: "Completed",
        statusFailed: "Failed",
        statusCancelled: "Cancelled",
        statusTesting: "Testing",
        testing: "Testing",
        completed: "Completed",
        failed: "Failed",
        cancelled: "Cancelled",
        retryFailed: "Retry failed",
        clearResults: "Clear results",
        confirmClearResults: "Clear all results from this run?",
        emptyResults: "No results yet. Configure a target and press Start Test.",
        noSearchResults: "No results match the current filter.",
        noFailedTests: "Nothing to retry — no failed or cancelled tests.",
        retryStarted: "Retrying failed tests",
        runInProgress: "A test run is already in progress",
        stopFirst: "Stop the current run first",
        runCancelled: "Test run cancelled",
        testCompleted: "All tests completed",
        testFailed: "Test failed",

        // Statistics
        statistics: "Statistics",
        averageFirstToken: "Avg First Token (ms)",
        p50FirstToken: "P50 First Token (ms)",
        p90FirstToken: "P90 First Token (ms)",
        p95FirstToken: "P95 First Token (ms)",
        p99FirstToken: "P99 First Token (ms)",
        totalLatency: "Avg Total Latency (ms)",
        averageOutputSpeed: "Avg Output Speed (t/s)",
        p50Speed: "P50 Speed (t/s)",
        p90Speed: "P90 Speed (t/s)",
        tpot: "Avg TPOT (ms/token)",
        itlP90: "ITL P90 (ms)",
        itlMax: "ITL Max (ms)",
        chunkInterval: "ITL is the gap between consecutive streamed chunks, not between tokens.",
        inputTps: "Input TPS (t/s)",
        totalTokens: "Total Tokens",
        tokens: "Tokens",
        avgCost: "Avg Cost ($)",
        tokensPerDollar: "Tokens per $1",
        maxOutputTokens: "Max Output Tokens",
        avgInputTokens: "Avg Input Tokens",
        avgOutputTokens: "Avg Output Tokens",
        successRate: "Success Rate",
        errorRate: "Error Rate",
        errorType: "Error Type",
        tooltipStalls: "Stalls >1s",
        emptyStatistics: "Statistics appear once a test has finished.",

        // History
        history: "History",
        historyEmpty: "No history records found",
        historyCleared: "History records cleared",
        clearHistory: "Clear history",
        exportHistory: "Export history",
        testDate: "Test Date",
        apiEndpoint: "API Endpoint",
        totalModels: "Total Models",
        totalTests: "Total Tests",
        successfulTests: "Successful Tests",
        cancelledTests: "Cancelled Tests",
        record: "Record",
        confirmDeleteHistory: "Delete this history record?",
        confirmClearHistory: "Are you sure you want to clear all history records? This action cannot be undone.",
        deleteHistoryRecord: "Delete record",
        rerunFromRecord: "Re-run",

        // Model picker / dialogs
        modelPickerTitle: "Select models",
        modelPickerSearch: "Search models...",
        selectAll: "Select All",
        deselectAll: "Deselect All",
        useSelectedModels: "Use Selected Models",
        noModelsSelected: "Select at least one model",
        detailTitle: "Test result",
        confirmTitle: "Please confirm",
        close: "Close",
        cancel: "Cancel",
        confirm: "Confirm",

        // Exports
        exportCsv: "Export CSV",
        exportJson: "Export JSON",
        exportStatistics: "Export Statistics",
        noResultsToExport: "No results to export",
        noStatsToExport: "No statistics to export",

        // Validation
        promptRequired: "At least one prompt is required",
        urlRequired: "Target #{n}: Base URL is required",
        urlInvalid: "Target #{n}: Base URL is not a valid URL",
        keyRequired: "Target #{n}: API Key is required for this protocol",
        modelsRequired: "Target #{n}: At least one model is required",
        noEnabledTargets: "All targets are disabled — enable at least one target to run a test",
        temperatureLimit: "Target #{n}: Temperature must be between 0 and {max}",
        topPLimit: "Target #{n}: Top P must be between 0 and {max}",

        // Error buckets
        err_rate_limit: "Rate Limit (429)",
        err_unauthorized: "Unauthorized (401)",
        err_forbidden: "Forbidden (403)",
        err_bad_request: "Bad Request (400)",
        err_timeout: "Timeout",
        err_server_error: "Server Error (5xx)",
        err_service_unavailable: "Service Unavailable (503)",
        err_network: "Network Error",
        err_cancelled: "Cancelled",
        err_other: "Other",
        err_http: "HTTP {code}"
    },
    zh: {
        title: "LLM SpeedTest",
        metaDescription: "LLM SpeedTest — 对比 OpenAI、Anthropic、Google、Ollama 与 Cohere 接口的首字延迟、吞吐与成本。",
        skipToContent: "跳到主内容",
        footer: "LLM SpeedTest - 比较和分析 AI 模型性能",
        language: "语言",

        settings: "设置",
        viewOnGithub: "在 GitHub 上查看",
        testTargets: "测试目标",
        addTarget: "+ 添加目标",
        removeTarget: "移除",
        duplicateTarget: "复制",
        moveUp: "上移",
        moveDown: "下移",
        disableTarget: "禁用",
        enableTarget: "启用",
        targetProtocol: "协议",
        targetApiUrl: "基础地址",
        targetApiKey: "API 密钥",
        targetModels: "模型（每行一个）",
        toggleApiKey: "切换 API 密钥显示",
        fetchModels: "拉取模型",
        fetchingModels: "拉取中...",
        fetchModelsFailed: "拉取模型失败",
        fetchModelsNetworkHint: "请求未到达服务器：请确认服务已启动、端口正确。若被跨域拦截，接口需返回 Access-Control-Allow-Origin（页面 {page} → 接口 {api}）。",
        fetchModelsSuccess: "模型拉取成功",
        noModelsFetched: "未返回模型",
        detectProtocol: "检测协议",
        detecting: "检测中...",
        detectTitle: "协议检测结果",
        protocolDetected: "检测到协议：{label}",
        protocolNotDetected: "没有协议应答——请检查地址、密钥和跨域设置",
        urlEmpty: "请先填写 Base URL",
        detectOk: "可用",
        detectPartial: "部分可用",
        detectNone: "无响应",
        detectStageModels: "模型列表",
        detectStageChat: "1-token 请求",
        detectReasonOk: "响应结构符合",
        detectReasonOkBody: "2xx，但结构不符",
        detectReasonAuth: "鉴权被拒——路由存在",
        detectReasonError: "错误结构匹配——路由存在",
        detectReasonNotFound: "404——不是该协议",
        detectReasonMethod: "405——方法不对",
        detectReasonHttp: "HTTP 错误",
        detectReasonNetwork: "网络不可达",
        detectReasonTimeout: "超时",
        detectTrialModel: "试用模型：{model}",
        detectDefaultModel: "默认试用模型：{model}",
        importConfig: "导入配置",
        exportConfig: "导出配置",
        configImported: "配置已导入",
        configImportFailed: "导入失败：文件不是有效的配置",
        keysNotExported: "API 密钥不会被导出",
        confirmImportConfig: "用导入的文件替换当前配置？",

        prompts: "提示词",
        addPrompt: "+ 添加提示词",
        deletePrompt: "删除提示词",
        restorePrompts: "恢复默认",
        promptPh: "提示词内容...",

        rounds: "测试轮数",
        concurrency: "并发数",
        advancedSettings: "高级设置",
        maxTokens: "最大 Tokens",
        temperature: "温度",
        topP: "Top P",
        timeout: "超时 (秒)",
        timeoutHint: "单个请求超过该时长即中断",
        requestTimeoutHint: "请求超时——较慢的模型请在高级设置中调大超时。",
        systemPrompt: "系统提示词",
        systemPromptPh: "You are a helpful assistant.",
        modelPrices: "模型价格 ($ / 百万 token)",
        modelPricesPh: "每行一个：名称=输入价,输出价，如 gpt-4o=2.5,10",
        startTest: "开始测试",
        stopTest: "停止",

        tabLive: "实时",
        tabResults: "结果",
        tabStatistics: "统计",
        tabHistory: "历史",

        emptyLive: "当前没有进行中的请求。开始测试即可查看流式输出。",
        liveResponse: "流式输出",

        results: "结果",
        model: "模型",
        target: "目标",
        prompt: "提示词",
        round: "轮次",
        firstTokenTime: "首字响应 (ms)",
        outputSpeed: "输出速度 (t/s)",
        result: "结果",
        error: "错误",
        status: "状态",
        actions: "操作",
        viewResult: "查看",
        deleteRow: "删除",
        searchResults: "搜索结果...",
        statusAll: "全部状态",
        statusCompleted: "完成",
        statusFailed: "失败",
        statusCancelled: "已取消",
        statusTesting: "检测中",
        testing: "检测中",
        completed: "完成",
        failed: "失败",
        cancelled: "已取消",
        retryFailed: "重跑失败项",
        clearResults: "清空结果",
        confirmClearResults: "清空本轮所有结果？",
        emptyResults: "还没有结果。配置一个目标后点击开始测试。",
        noSearchResults: "没有符合当前筛选条件的结果。",
        noFailedTests: "没有需要重跑的项——没有失败或取消的测试。",
        retryStarted: "正在重跑失败项",
        runInProgress: "已有测试正在运行",
        stopFirst: "请先停止当前测试",
        runCancelled: "测试已取消",
        testCompleted: "所有测试已完成",
        testFailed: "测试失败",

        statistics: "统计信息",
        averageFirstToken: "平均首字响应 (ms)",
        p50FirstToken: "P50 首字响应 (ms)",
        p90FirstToken: "P90 首字响应 (ms)",
        p95FirstToken: "P95 首字响应 (ms)",
        p99FirstToken: "P99 首字响应 (ms)",
        totalLatency: "平均总响应 (ms)",
        averageOutputSpeed: "平均输出速度 (t/s)",
        p50Speed: "P50 速度 (t/s)",
        p90Speed: "P90 速度 (t/s)",
        tpot: "平均 TPOT (ms/token)",
        itlP90: "ITL P90 (ms)",
        itlMax: "ITL 最大 (ms)",
        chunkInterval: "ITL 为相邻流式分块之间的间隔，而非逐 token 间隔。",
        inputTps: "输入速度 (t/s)",
        totalTokens: "总 Tokens",
        tokens: "令牌数",
        avgCost: "平均成本 ($)",
        tokensPerDollar: "每美元 Token 数",
        maxOutputTokens: "最大输出 Tokens",
        avgInputTokens: "平均输入 Tokens",
        avgOutputTokens: "平均输出 Tokens",
        successRate: "成功率",
        errorRate: "错误率",
        errorType: "错误类型",
        tooltipStalls: "卡顿>1s",
        emptyStatistics: "测试结束后显示统计数据。",

        history: "历史记录",
        historyEmpty: "没有找到历史记录",
        historyCleared: "历史记录已清除",
        clearHistory: "清除历史",
        exportHistory: "导出历史",
        testDate: "测试日期",
        apiEndpoint: "API 接口",
        totalModels: "模型总数",
        totalTests: "测试总数",
        successfulTests: "成功测试数",
        cancelledTests: "取消测试数",
        record: "记录",
        confirmDeleteHistory: "删除这条历史记录？",
        confirmClearHistory: "您确定要清除所有历史记录吗？此操作无法撤销。",
        deleteHistoryRecord: "删除记录",
        rerunFromRecord: "重跑",

        modelPickerTitle: "选择模型",
        modelPickerSearch: "搜索模型...",
        selectAll: "全选",
        deselectAll: "取消全选",
        useSelectedModels: "使用选中模型",
        noModelsSelected: "请至少选择一个模型",
        detailTitle: "测试结果",
        confirmTitle: "请确认",
        close: "关闭",
        cancel: "取消",
        confirm: "确认",

        exportCsv: "导出 CSV",
        exportJson: "导出 JSON",
        exportStatistics: "导出统计",
        noResultsToExport: "无可导出的结果",
        noStatsToExport: "无可导出的统计",

        promptRequired: "请至少输入一条提示词",
        urlRequired: "目标 #{n}：请填写基础地址",
        urlInvalid: "目标 #{n}：基础地址不是有效的 URL",
        keyRequired: "目标 #{n}：该协议需要 API 密钥",
        modelsRequired: "目标 #{n}：请至少填写一个模型",
        noEnabledTargets: "所有目标都已禁用——请至少启用一个目标",
        temperatureLimit: "目标 #{n}：温度需在 0 到 {max} 之间",
        topPLimit: "目标 #{n}：Top P 需在 0 到 {max} 之间",

        err_rate_limit: "限流 (429)",
        err_unauthorized: "未授权 (401)",
        err_forbidden: "禁止访问 (403)",
        err_bad_request: "请求错误 (400)",
        err_timeout: "超时",
        err_server_error: "服务器错误 (5xx)",
        err_service_unavailable: "服务不可用 (503)",
        err_network: "网络错误",
        err_cancelled: "已取消",
        err_other: "其他",
        err_http: "HTTP {code}"
    }
};

class I18n {
    constructor() {
        this._listeners = [];
        this.currentLanguage = this.detectLanguage();
        this.init();
    }

    detectLanguage() {
        // ?lang= is honoured once, on first load only.
        const urlParams = new URLSearchParams(window.location.search);
        const langParam = urlParams.get('lang');
        if (langParam && translations[langParam]) return langParam;

        // An explicit user choice always wins.
        try {
            const savedLang = localStorage.getItem('language');
            if (savedLang && translations[savedLang]) return savedLang;
        } catch (_) { /* storage unavailable (file://) */ }

        // Chinese is the default UI language; English stays one click away.
        return 'zh';
    }

    init() {
        this.updateLanguageSelector();
        this.updateTexts();
        this.updateDirection();
        this.setupEventListeners();
    }

    // Register a re-render callback; returns an unsubscribe function.
    onChange(fn) {
        if (typeof fn !== 'function') return () => {};
        this._listeners.push(fn);
        return () => {
            const i = this._listeners.indexOf(fn);
            if (i >= 0) this._listeners.splice(i, 1);
        };
    }

    updateLanguageSelector() {
        const selector = document.getElementById('languageSelect');
        if (selector) selector.value = this.currentLanguage;
    }

    updateTexts() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            element.textContent = this.t(element.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(element => {
            element.setAttribute('placeholder', this.t(element.getAttribute('data-i18n-ph')));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            element.setAttribute('title', this.t(element.getAttribute('data-i18n-title')));
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(element => {
            element.setAttribute('aria-label', this.t(element.getAttribute('data-i18n-aria')));
        });
        document.querySelectorAll('[data-i18n-label]').forEach(element => {
            element.setAttribute('label', this.t(element.getAttribute('data-i18n-label')));
        });

        document.title = this.t('title');
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute('content', this.t('metaDescription'));
    }

    updateDirection() {
        document.documentElement.setAttribute('dir', 'ltr');
        document.documentElement.setAttribute('lang', this.currentLanguage);
    }

    setupEventListeners() {
        const selector = document.getElementById('languageSelect');
        if (selector) {
            selector.addEventListener('change', (e) => this.changeLanguage(e.target.value));
        }
    }

    changeLanguage(lang) {
        if (!translations[lang]) return;
        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        this.updateTexts();
        this.updateDirection();
        this.updateLanguageSelector();
        this._listeners.forEach(fn => {
            try {
                fn(lang);
            } catch (err) {
                console.warn('i18n listener failed:', err);
            }
        });
    }

    // t('key') or t('key', {n: 1, max: 2})
    t(key, vars) {
        const lang = translations[this.currentLanguage] || translations.en;
        let str = lang[key];
        if (str === undefined) str = translations.en[key];
        if (str === undefined) return key;
        if (vars) {
            str = String(str).replace(/\{(\w+)\}/g, (match, name) =>
                vars[name] !== undefined ? String(vars[name]) : match);
        }
        return str;
    }
}

// Initialize i18n when DOM is loaded
let i18n;
document.addEventListener('DOMContentLoaded', () => {
    i18n = new I18n();
    if (typeof window !== 'undefined') window.i18n = i18n;
});
