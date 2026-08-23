# LLM SpeedTest

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/stargazers)
[![GitHub license](https://img.shields.io/github/license/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/dianaloveava/llm-speedtest?style=flat-square)](https://github.com/dianaloveava/llm-speedtest/issues)

**给大模型 API 测速——在浏览器里直接测量各服务商的首字延迟、吞吐、Token 用量与成本。**

**语言：** [English](README.md) | [中文](README_CN.md)

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
- 测试中实时查看器；结束后可查看单请求详情
- 历史记录（本地保存最近 5 次，含模型级汇总）
- CSV / JSON 导出（逐请求结果 + 按模型统计）
- 中英双语界面

## 快速开始

无需安装、无需构建、零依赖。

**跨平台：**
```bash
# Python 3
python -m http.server 8000

# 或 Node.js (npx)
npx serve .
```
然后打开 `http://localhost:8000`（或你选择的端口）。

> 任何静态文件服务器都可以；应用本身只需要一个现代浏览器。

## 配置说明

1. **添加目标行**：选择协议、填写 Base URL（自动补全）、API Key、模型（每行一个）。
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
├── i18n.js             # 中英文翻译
├── styles.css          # 样式（浅色主题）
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
