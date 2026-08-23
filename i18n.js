// Internationalization support
const translations = {
    en: {
        title: "LLM SpeedTest",
        configuration: "Configuration",
        protocol: "Protocol",
        apiUrl: "API URL",
        apiKey: "API Key",
        models: "Models (one per line)",
        prompts: "Custom Prompts (one per line)",
        rounds: "Test Rounds",
        startTest: "Start Test",
        results: "Results",
        model: "Model",
        prompt: "Prompt",
        round: "Round",
        firstTokenTime: "First Token (ms)",
        outputSpeed: "Output Speed (t/s)",
        result: "Result",
        error: "Error",
        status: "Status",
        footer: "LLM SpeedTest - Compare and analyze AI model performance",
        testing: "Testing",
        completed: "Completed",
        failed: "Failed",
        clickToExpand: "Click to expand",
        invalidConfig: "Please fill in all required fields",
        testStarted: "Test started",
        testCompleted: "All tests completed",
        noModels: "Please enter at least one model",
        noPrompts: "Please enter at least one prompt",

        realtimeViewer: "Real-time Result Viewer",
        resultDetailViewer: "Test Result Detail",
        tokens: "Tokens",
        viewResult: "View Result",
        clickToViewInViewer: "Click to view in real-time viewer",
        clickToViewProgress: "Click to view current progress",
        realtimeView: "Real-time View",
        inputTps: "Input TPS (t/s)",
        avgCost: "Avg Cost ($)",
        tokensPerDollar: "Tokens per $1",
        modelPrices: "Model Prices ($ per 1M tokens)",
        modelPricesPh: "One per line: name=input,output — e.g. gpt-4o=2.5,10",
        p95FirstToken: "P95 First Token (ms)",
        p99FirstToken: "P99 First Token (ms)",
        totalLatency: "Avg Total Latency (ms)",
        tpot: "Avg TPOT (ms/token)",
        itlP90: "ITL P90 (ms)",
        errorType: "Error Type",
        tooltipStalls: "Stalls >1s",
        errorRate: "Error Rate",
        err_rate_limit: "Rate Limit (429)",
        err_unauthorized: "Unauthorized (401)",
        err_forbidden: "Forbidden (403)",
        err_bad_request: "Bad Request (400)",
        err_timeout: "Timeout (408)",
        err_server_error: "Server Error (5xx)",
        err_service_unavailable: "Service Unavailable (503)",
        err_network: "Network Error",
        err_cancelled: "Cancelled",
        err_other: "Other",
        error: "Error",
        statistics: "Statistics",
        averageFirstToken: "Avg First Token (ms)",
        averageOutputSpeed: "Avg Output Speed (t/s)",
        successRate: "Success Rate",
        history: "History Records",
        showHistory: "Show History",
        clearHistory: "Clear History",
        historyEmpty: "No history records found",
        historyCleared: "History records cleared",
        testDate: "Test Date",
        apiEndpoint: "API Endpoint",
        totalModels: "Total Models",
        totalTests: "Total Tests",
        successfulTests: "Successful Tests",
        record: "Record",
        tokensPerSecond: "tokens/s",
        confirmClearHistory: "Are you sure you want to clear all history records? This action cannot be undone.",
        apiBaseUrl: "API Base URL",
        toggleApiKey: "Toggle API key visibility",
        fetchModels: "Fetch Models",
        fetchingModels: "Fetching...",
        fetchModelsFailed: "Failed to fetch models",
        fetchModelsSuccess: "Models fetched",
        modelPickerSearch: "Search models...",
        selectAll: "Select All",
        deselectAll: "Deselect All",
        useSelectedModels: "Use Selected Models",
        noModelsFetched: "No models returned",
        advancedSettings: "Advanced Settings",
        maxTokens: "Max Tokens",
        temperature: "Temperature",
        topP: "Top P",
        systemPrompt: "System Prompt",
        concurrency: "Concurrency",
        stopTest: "Stop",
        exportCsv: "Export CSV",
        exportJson: "Export JSON",
        exportStatistics: "Export Statistics",
        searchResults: "Search results...",
        p50FirstToken: "P50 First Token (ms)",
        p90FirstToken: "P90 First Token (ms)",
        p50Speed: "P50 Speed (t/s)",
        p90Speed: "P90 Speed (t/s)",
        totalTime: "Total Time",
        testTargets: "Test Targets",
        addTarget: "+ Add Target",
        removeTarget: "Remove",
        disableTarget: "Disable",
        enableTarget: "Enable",
        targetProtocol: "Protocol",
        targetApiUrl: "Base URL",
        targetApiKey: "API Key",
        targetModels: "Models (one per line)",
        target: "Target",
        noResultsToExport: "No results to export",
        noStatsToExport: "No statistics to export",
        testFailed: "Test failed",
        progress: "Progress",
        totalTokens: "Total Tokens"
    },
    zh: {
        title: "LLM SpeedTest",
        configuration: "配置",
        protocol: "协议",
        apiUrl: "API 地址",
        apiKey: "API 密钥",
        models: "模型（每行一个）",
        prompts: "自定义提示词（每行一个）",
        rounds: "测试轮数",
        startTest: "开始测试",
        results: "结果",
        model: "模型",
        prompt: "提示词",
        round: "轮次",
        firstTokenTime: "首字响应 (ms)",
        outputSpeed: "输出速度 (t/s)",
        result: "结果",
        error: "异常",
        status: "状态",
        footer: "LLM SpeedTest - 比较和分析AI模型性能",
        testing: "检测中",
        completed: "完成",
        failed: "失败",
        clickToExpand: "点击展开",
        invalidConfig: "请填写所有必填字段",
        testStarted: "测试已开始",
        testCompleted: "所有测试已完成",
        noModels: "请输入至少一个模型",
        noPrompts: "请输入至少一个提示词",

        realtimeViewer: "实时结果查看器",
        resultDetailViewer: "测试结果详情",
        tokens: "令牌数",
        viewResult: "查看结果",
        clickToViewInViewer: "点击在实时查看器中查看",
        clickToViewProgress: "点击查看当前进度",
        realtimeView: "实时查看",
        inputTps: "输入速度 (t/s)",
        avgCost: "平均成本 ($)",
        tokensPerDollar: "每美元 Token 数",
        modelPrices: "模型价格 ($ / 百万 token)",
        modelPricesPh: "每行一个：名称=输入价,输出价，如 gpt-4o=2.5,10",
        p95FirstToken: "P95 首字响应 (ms)",
        p99FirstToken: "P99 首字响应 (ms)",
        totalLatency: "平均总响应 (ms)",
        tpot: "平均 TPOT (ms/token)",
        itlP90: "ITL P90 (ms)",
        errorType: "错误类型",
        tooltipStalls: "卡顿>1s",
        errorRate: "错误率",
        err_rate_limit: "限流 (429)",
        err_unauthorized: "未授权 (401)",
        err_forbidden: "禁止访问 (403)",
        err_bad_request: "请求错误 (400)",
        err_timeout: "超时 (408)",
        err_server_error: "服务器错误 (5xx)",
        err_service_unavailable: "服务不可用 (503)",
        err_network: "网络错误",
        err_cancelled: "已取消",
        err_other: "其他",
        error: "错误",
        statistics: "统计信息",
        averageFirstToken: "平均首字响应 (ms)",
        averageOutputSpeed: "平均输出速度 (t/s)",
        successRate: "成功率",
        history: "历史记录",
        showHistory: "显示历史",
        clearHistory: "清除历史",
        historyEmpty: "没有找到历史记录",
        historyCleared: "历史记录已清除",
        testDate: "测试日期",
        apiEndpoint: "API 接口",
        totalModels: "模型总数",
        totalTests: "测试总数",
        successfulTests: "成功测试数",
        record: "记录",
        tokensPerSecond: "令牌/秒",
        confirmClearHistory: "您确定要清除所有历史记录吗？此操作无法撤销。",
        apiBaseUrl: "API 基础地址",
        toggleApiKey: "切换 API 密钥显示",
        fetchModels: "拉取模型",
        fetchingModels: "拉取中...",
        fetchModelsFailed: "拉取模型失败",
        fetchModelsSuccess: "模型拉取成功",
        modelPickerSearch: "搜索模型...",
        selectAll: "全选",
        deselectAll: "取消全选",
        useSelectedModels: "使用选中模型",
        noModelsFetched: "未返回模型",
        advancedSettings: "高级设置",
        maxTokens: "最大 Tokens",
        temperature: "温度",
        topP: "Top P",
        systemPrompt: "系统提示词",
        concurrency: "并发数",
        stopTest: "停止",
        exportCsv: "导出 CSV",
        exportJson: "导出 JSON",
        exportStatistics: "导出统计",
        searchResults: "搜索结果...",
        p50FirstToken: "P50 首字响应 (ms)",
        p90FirstToken: "P90 首字响应 (ms)",
        p50Speed: "P50 速度 (t/s)",
        p90Speed: "P90 速度 (t/s)",
        totalTokens: "总 Tokens",
        totalTime: "总耗时",
        testTargets: "测试目标",
        addTarget: "+ 添加目标",
        removeTarget: "移除",
        disableTarget: "禁用",
        enableTarget: "启用",
        targetProtocol: "协议",
        targetApiUrl: "基础地址",
        targetApiKey: "API 密钥",
        targetModels: "模型 (每行一个)",
        target: "目标",
        noResultsToExport: "无可导出的结果",
        noStatsToExport: "无可导出的统计",
        testFailed: "测试失败",
        progress: "进度"
    },
};

class I18n {
    constructor() {
        this.currentLanguage = this.detectLanguage();
        this.init();
    }

    detectLanguage() {
        // Check URL parameter first
        const urlParams = new URLSearchParams(window.location.search);
        const langParam = urlParams.get('lang');
        if (langParam && translations[langParam]) {
            return langParam;
        }

        // Check localStorage
        const savedLang = localStorage.getItem('language');
        if (savedLang && translations[savedLang]) {
            return savedLang;
        }

        // Check browser language
        const browserLang = navigator.language.split('-')[0];
        if (translations[browserLang]) {
            return browserLang;
        }

        // Default to English
        return 'en';
    }

    init() {
        this.updateLanguageSelector();
        this.updateTexts();
        this.updateDirection();
        this.setupEventListeners();
    }

    updateLanguageSelector() {
        const selector = document.getElementById('languageSelect');
        if (selector) {
            selector.value = this.currentLanguage;
        }
    }

    updateTexts() {
        const t = (key) => {
            const lang = translations[this.currentLanguage];
            return (lang && lang[key]) || translations.en[key] || key;
        };

        // data-i18n → textContent (with en fallback)
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = t(key);
        });

        // data-i18n-label → label attribute (optgroup labels)
        document.querySelectorAll('[data-i18n-label]').forEach(element => {
            const key = element.getAttribute('data-i18n-label');
            element.setAttribute('label', t(key));
        });

        // data-i18n-ph → placeholder attribute
        document.querySelectorAll('[data-i18n-ph]').forEach(element => {
            const key = element.getAttribute('data-i18n-ph');
            element.setAttribute('placeholder', t(key));
        });

        // Update page title
        document.title = t('title');

        // Update meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
            metaDesc.setAttribute('content', t('footer'));
        }
    }

    updateDirection() {
        // Only LTR languages remain (en, zh)
        document.documentElement.setAttribute('dir', 'ltr');
        document.documentElement.setAttribute('lang', this.currentLanguage);
    }

    setupEventListeners() {
        const selector = document.getElementById('languageSelect');
        if (selector) {
            selector.addEventListener('change', (e) => {
                this.changeLanguage(e.target.value);
            });
        }
    }

    changeLanguage(lang) {
        if (translations[lang]) {
            this.currentLanguage = lang;
            localStorage.setItem('language', lang);
            this.updateTexts();
            this.updateDirection();
            
            // Update URL without reload
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            window.history.replaceState({}, '', url);
        }
    }

    t(key) {
        return translations[this.currentLanguage][key] || translations.en[key] || key;
    }
}

// Initialize i18n when DOM is loaded
let i18n;
document.addEventListener('DOMContentLoaded', () => {
    i18n = new I18n();
    if (typeof window !== 'undefined') window.i18n = i18n;
});