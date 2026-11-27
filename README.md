# LLM SpeedTest

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/stargazers)
[![GitHub license](https://img.shields.io/github/license/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/issues)

**给大模型 API 测速——在浏览器里直接测量各服务商的首字延迟、吞吐、Token 用量与成本。**

**文档语言：** 中文 | [English](README_EN.md) · **界面默认中文**（可在页头切换为 English）。

</div>

## 简介

LLM SpeedTest 是一个零依赖、纯浏览器端的大模型 API 基准测试工具。配置多个 API 目标（不同服务商、协议或模型），并发发送流式请求，在延迟、吞吐、Token 用量和成本四个维度上横向对比。

一切都在本地浏览器中完成：API Key 只保存在浏览器 localStorage，请求从浏览器直连你配置的端点，没有后端、没有遥测、没有中转。

## 功能

### 协议支持
- **OpenAI Chat Completions**（`/v1/chat/completions`）——兼容所有 OpenAI 兼容端点
- **OpenAI Responses**（`/v1/responses`）
- **Anthropic Messages**（`/v1/messages`）
- **Google Generative AI / Gemini**（`streamGenerateContent?alt=sse`）
- **Ollama Chat**（`/api/chat`）——测试本地模型
- **Cohere Chat**（`/v2/chat`）
- Base URL 智能补全：只填 `http://host:8000`，完整路径自动补齐
- 支持的协议可一键拉取模型列表

### 流式与真实 Token 用量
- 真 SSE 流式，逐 Token 记录时间戳
- 服务商上报真实用量时自动采集（OpenAI `stream_options.include_usage`、Anthropic `message_delta.usage`、Gemini `usageMetadata`），否则回退估算

### 性能指标
- **首字延迟 TTFT**：均值 / P50 / P90 / P95 / P99
- **总响应时间 TTLT**：均值
- **输出速度**（t/s）：均值 / P50 / P90
- **TPOT**（平均每输出 Token 耗时，不含首字等待）
- **ITL**（相邻 Token 间隔）：P90 / 最大值
- **输入（prefill）速度**（t/s）
- Token 统计、成功率、错误分类（429 限流 / 401·403 鉴权 / 400 / 超时 / 5xx 服务端 / 网络 / 已取消）

### 成本分析
- 按模型配置价格（`模型=输入价,输出价`，单位 $/百万 Token，如 `gpt-4o=2.5,10`）
- 单请求与总成本、每美元 Token 数

### 使用体验
- 多目标管理，每目标独立协议 / 地址 / Key / 模型
- 并发请求 + 可配置轮次
- 目标可禁用并折叠（配置保留，不参与测试）
- 测试中实时标签页；结束后可在详情弹层查看单请求
- 历史记录（本地保存最近 20 次，含模型级汇总，支持单条删除 / 重跑 / 导出）
- CSV / JSON 导出（逐请求结果 + 按模型统计），另支持配置导入导出
- 中英双语界面，默认中文

## 快速开始

无需安装、无需构建、零依赖。

**一条命令（起服务 + 自动打开默认浏览器）：**
```bash
# Python 3 —— 只需标准库
python serve.py

# Windows 也可直接双击 start.bat
```
`serve.py` 默认端口 8000，被占用时自动顺延；可用 `--port 8080` 指定、`--no-open` 只起服务不开浏览器。

**任何静态服务器同样可用（需自行打开地址）：**
```bash
python -m http.server 8000
npx serve .
```

> 应用本身只需要一个现代浏览器。

**本机接口拒绝跨域（CORS）怎么办：**浏览器只接受带 `Access-Control-Allow-Origin` 的跨域响应，并会先发 `OPTIONS` 预检；不少本地模型网关两者都没有（预检直接 404），于是请求在浏览器里就被拦下，换哪个前端都一样。把它挂到同源反代上即可：

```bash
python serve.py --proxy http://127.0.0.1:3425
```

然后把目标的「基础地址」填成 **`http://127.0.0.1:8000/api`**——请求由本地服务转发，与页面同源，浏览器不再做 CORS 检查；SSE 逐块透传，首字延迟与速度统计不受影响（已实测首块 30ms 到达，未缓冲）。

### 桌面应用（Tauri 2）

同一套前端也能打包成原生窗口应用。桌面版把 HTTP 交给 Rust（reqwest）发出，**不存在浏览器同源策略**，所以不需要 CORS，也不必用 `--proxy`。

```bash
npm install     # 只装 @tauri-apps/cli
npm run dev     # 构建 dist/ 并打开窗口
npm run build   # 产出安装包（Windows .msi/.exe、macOS .dmg、Linux .deb/.AppImage）
```

- 首次编译需要 Rust（rustup + MSVC Build Tools）和 WebView2（Win11 自带）。
- 前端仍是那几个文件，`dist/` 在构建时生成（不入库）；桌面版只是同一个页面的宿主。
- 跨平台：Windows / macOS / Linux 各自在本机编译（CI 可用三系统矩阵），Linux 需 WebKitGTK 4.1+。

> 若 `cargo` 卡在拉依赖（镜像 403 / 连接被重置），换默认源重试：
> `CARGO_HOME=/tmp/cargo-home cargo build`（Windows：`set CARGO_HOME=D:\cargo-home`），
> 或修好 `~/.cargo/config.toml` 里的镜像地址。

## 配置说明

1. **添加目标行**：选择协议、填写 Base URL（自动补全）、API Key、模型（每行一个）。
   不确定对方是哪种协议？点协议旁的 **检测协议**：用这一行的 Base URL 和 Key 逐个协议试探——先取模型列表（不耗 Token），再发一个 1-token、关闭流式的补全——按证据打分：2xx 且结构符合最可信，鉴权被拒 / 错误结构匹配次之（说明路由存在），404 直接排除；自动选中得分最高者，并弹出每个协议的判定与依据（含试用的模型名）。
2. **添加更多目标**横向对比不同服务商或模型；禁用某目标可保留配置但跳过测试。
3. **测试参数**：提示词、轮次，以及高级设置——temperature、top_p、最大 Token、系统提示词、并发数。
4. **模型价格**（可选，用于成本分析）：每行一个模型，`模型=输入价,输出价`，单位 $/百万 Token：
   ```
   gpt-4o=2.5,10
   deepseek-chat=0.27,1.1
   ```
5. **开始测试**——实时观看请求流式返回，然后查看统计表并导出 CSV/JSON。

## 指标说明

| 指标 | 含义 | 单位 |
|------|------|------|
| 首字延迟 TTFT | 从发出请求到收到首个响应 Token 的时间 | ms |
| 总响应时间 | 从发出请求到完整响应结束的时间 | ms |
| 输出速度 | 每秒输出 Token 数（总 Token / 总延迟） | t/s |
| TPOT | 平均每个输出 Token 的耗时（不含首字等待） | ms/token |
| ITL | 相邻 Token 间隔（P90 / 最大值） | ms |
| 输入速度 | 输入 Token / 首字延迟——prefill 吞吐 | t/s |
| 成本 | 按配置价格计算，单请求与按模型汇总 | $ |
| 成功率 | 成功请求数 / 总请求数 | % |

## 隐私与安全

- API Key 只存在浏览器 localStorage 中——除你配置的端点外不会发往任何地方。
- 请求从浏览器**直连**各端点，无代理、无遥测。
- 注意：部分云服务商会拦截浏览器跨域（CORS）请求。本地端点（如 Ollama）和允许 CORS 的网关开箱即用；被拦截的服务商请使用带 CORS 头的网关或自建中转。
- 请勿在共用设备上输入真实 Key；用完记得清理浏览器存储。

## 项目结构

```
llm-speedtest/
├── index.html          # 单页应用界面
├── app.js              # 测试编排、统计、历史、导出
├── api-handlers.js     # 六种协议实现与流式解析
├── transport.js        # 传输层：网页用 fetch，桌面版走 Rust
├── i18n.js             # 中英文翻译
├── styles.css          # 样式（浅色主题）
├── serve.py            # 本地静态服务器（可选同源反代），启动后自动打开浏览器
├── start.bat           # Windows 一键启动
├── scripts/            # 构建脚本（生成 dist/ 与图标）
├── src-tauri/          # Tauri 2 桌面外壳（Rust + reqwest）
├── package.json        # 仅用于 @tauri-apps/cli 与 npm 脚本
└── LICENSE             # MIT 许可证
```

## 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交修改（`git commit -m "feat: add amazing-feature"`）
4. 推送分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request

## 致谢

本项目基于 [qjr87](https://github.com/qjr87) 的 [llm-api-test](https://github.com/qjr87/llm-api-test) 开发，感谢原作者的工作。

## 许可证

本项目基于 MIT 许可证开源——详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**觉得有用的话，[给个 Star](https://github.com/dianaloveava/llm-speedtest) 吧！**

由 [dianaloveava](https://github.com/dianaloveava) 制作

</div>
