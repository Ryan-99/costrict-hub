# CoStrict Hub

CoStrict 额度代理中枢 —— 把 CoStrict(深信服 AI 编程助手)账号的 Credit 额度,通过本地 OpenAI / Anthropic 兼容接口代理给任意 AI 工具使用:Claude Code、Codex、Trae、WorkBuddy、CodeBuddy、ZCode、Qwen Code、Cline / Roo Code……

Tauri 2 桌面应用(Rust 核心 + React/TS 前端),Windows 优先,常驻托盘。

## 它是怎么工作的

```
AI 工具(任意 OpenAI / Anthropic 兼容客户端)
        │  http://127.0.0.1:14567/v1  (Bearer sk-costrict-…)
        ▼
costrict-router(第三方 Go 二进制,Hub 托管)
        │  协议转换 + 上游 token 自动刷新
        ▼
CoStrict 云端(https://zgsm.sangfor.com,支持企业内网地址)
```

Hub 负责编排:一键 SSO 登录、服务启停与自愈、本地 API Key 管理、额度看板、模型列表、用量统计、接入配置生成。上游 token 由 costrict-router 自己管理(Hub 不接触),与 pi-gui 等其他工具共享同一份登录态。

## 功能

- **仪表盘**:服务状态 / 启停 / 重启,Credit 额度进度条(15s 自动刷新),端点与 Key 一键复制,key reset(带失效警告)
- **模型**:上游模型列表 + 每模型单次 Credit 消耗 + 连通自检(真实发一条消息)
- **接入**:数据驱动条目,已代入端点 / Key / 模型的配置片段一键复制;国产(WorkBuddy / CodeBuddy / Trae / ZCode / Qwen Code)与国际(Claude Code / Codex / Cline)分 组;Codex 支持 router 自带的 `codex-catalog` 自动写入
- **统计**:按天调用量 / Token / 错误数,最近请求明细(来自 router `--debug` 日志)
- **设置**:服务地址(支持企业内网)、端口、开机自启、自愈拉起、退出停服、二进制下载与 sha256 校验

## 构建

```bash
pnpm install
pnpm tauri dev     # 开发
pnpm tauri build   # NSIS 安装包 → src-tauri/target/release/bundle/nsis/
```

要求:Node 20+、pnpm、Rust(stable,`x86_64-pc-windows-msvc`)。

## 安全与供应链

- 二进制下载内置 sha256 pin 表(v0.3.2 全平台资产),未 pin 的新版本走 TOFU(首次记录、事后变更即拒绝)
- 随包分发的二进制复制前做哈希校验
- 登录链接 / 服务地址只信任 `*.sangfor.com` 与本机回环,防钓鱼重定向
- 本地 API Key 存系统凭据管理器(keyring),降级才落文件;上游 token 由 router 自管,Hub 不落盘

## 相关项目

- [mokeyjay/costrict-router](https://github.com/mokeyjay/costrict-router) — 本地代理核心(Go)
- [zgsm-ai/costrict](https://github.com/zgsm-ai/costrict) — CoStrict 官方开源
