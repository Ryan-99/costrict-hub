// 接入页数据层:数据驱动条目,新增工具只需加一个 AgentEntry。
// 模板变量:{origin} = http://127.0.0.1:14567 | {endpoint} = {origin}/v1 | {key} = sk-costrict-… | {model} = 所选模型 ID

import workbuddyLogo from "../assets/logos/workbuddy.svg";
import codebuddyLogo from "../assets/logos/codebuddy.svg";
import traeLogo from "../assets/logos/trae.png";
import zcodeLogo from "../assets/logos/zcode.png";
import qwenLogo from "../assets/logos/qwen.png";
import claudeLogo from "../assets/logos/claude.png";
import openaiLogo from "../assets/logos/openai.png";
import clineLogo from "../assets/logos/cline.png";

export interface AgentSnippet {
  label: string;
  lang: "env" | "json" | "toml" | "text" | "cmd";
  content: string;
}

export interface AgentEntry {
  id: string;
  name: string;
  vendor: string;
  group: "domestic" | "international" | "generic";
  protocol: "OpenAI 兼容" | "Anthropic 兼容" | "OpenAI / Anthropic";
  /** 工具 logo 资源;缺省用首字母徽标 */
  logo?: string;
  /** 选择架单行展示用的短名;缺省用 name */
  shortName?: string;
  iconText: string;
  summary: string;
  steps: string[];
  snippets: AgentSnippet[];
  notes?: string[];
  /** 配置入口随版本变化,标注最后核对口径 */
  verified: string;
  /** 特殊动作:codex-catalog = 调 router 自动写 Codex 配置 */
  action?: "codex-catalog";
}

export const AGENT_ENTRIES: AgentEntry[] = [
  // ================= 国产 =================
  {
    id: "workbuddy",
    name: "WorkBuddy",
    vendor: "腾讯 CodeBuddy 生态",
    group: "domestic",
    protocol: "OpenAI 兼容",
    logo: workbuddyLogo,
    iconText: "WB",
    summary: "AI Agent 办公工具,图形界面接入自定义模型",
    steps: [
      "打开 WorkBuddy 设置,进入「模型配置」,点击添加自定义模型",
      "API 地址填本地端点(下方已生成),API Key 填本地 Key",
      "模型 ID 填模型页中的任意模型(如 {model})",
      "若界面有「自定义协议」开关,打开后 URL 按原样使用,不再自动补路径",
    ],
    snippets: [
      { label: "API 地址", lang: "text", content: "{endpoint}" },
      { label: "API Key", lang: "text", content: "{key}" },
      { label: "模型 ID", lang: "text", content: "{model}" },
    ],
    notes: [
      "自定义模型弹窗仅支持 OpenAI 兼容协议;配置只保存在本地 models.json,不上传",
      "若地址要求到具体接口,填 {endpoint}/chat/completions",
    ],
    verified: "官方文档 workbuddy.cn「模型配置」2026-09 核对",
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    vendor: "腾讯",
    group: "domestic",
    protocol: "OpenAI 兼容",
    logo: codebuddyLogo,
    iconText: "CB",
    summary: "腾讯 AI 编程助手(IDE / 插件),与 WorkBuddy 同源的自定义模型机制",
    steps: [
      "打开 CodeBuddy 设置中的模型/供应商配置",
      "选择自定义(OpenAI 兼容),填入下方端点与 Key",
      "模型 ID 填 {model}",
    ],
    snippets: [
      { label: "配置文件(推荐 GUI 添加)", lang: "text", content: "~/.codebuddy/models.json" },
      { label: "API 地址", lang: "text", content: "{endpoint}" },
      { label: "API Key", lang: "text", content: "{key}" },
    ],
    notes: ["不同版本入口可能为「模型服务」或「自定义模型」,字段一致"],
    verified: "按 CodeBuddy 通用自定义模型口径整理,建议以安装版本界面为准",
  },
  {
    id: "trae",
    name: "Trae",
    vendor: "字节跳动",
    group: "domestic",
    protocol: "OpenAI / Anthropic",
    logo: traeLogo,
    iconText: "T",
    summary: "AI 原生 IDE,支持自定义模型服务",
    steps: [
      "左下角设置图标 →「模型」,点击「添加模型」",
      "选择「自定义配置」,API 格式选 OpenAI(router 同时支持 Anthropic)",
      "请求地址填 {endpoint},API Key 填 {key}",
      "模型 ID 填 {model},保存后在对话中选择该模型",
    ],
    snippets: [
      { label: "请求地址(OpenAI 格式)", lang: "text", content: "{endpoint}" },
      { label: "请求地址(Anthropic 格式)", lang: "text", content: "{origin}" },
      { label: "API Key", lang: "text", content: "{key}" },
    ],
    notes: [
      "需 v3.3.51 及以上版本才支持自定义请求地址",
      "若报 404,把请求地址补全为 {endpoint}/chat/completions",
    ],
    verified: "Trae 官方文档 + 社区教程 v4.0(2026-05)核对",
  },
  {
    id: "zcode",
    name: "ZCode",
    vendor: "智谱",
    group: "domestic",
    protocol: "OpenAI / Anthropic",
    logo: zcodeLogo,
    iconText: "Z",
    summary: "GLM 生态 AI 编程客户端,支持自定义 provider",
    steps: [
      "编辑 ~/.zcode/v2/config.json,在 provider 下新增条目(右侧片段)",
      "保存后重启 ZCode,在模型选择中切换到该 provider",
      "模型 ID 可在模型页查询,按需增删 models 条目",
    ],
    snippets: [
      {
        label: "~/.zcode/v2/config.json 片段",
        lang: "json",
        content: `{
  "provider": {
    "custom:costrict": {
      "name": "CoStrict (Hub)",
      "kind": "anthropic",
      "options": {
        "apiKey": "{key}",
        "baseURL": "{origin}"
      },
      "enabled": true,
      "source": "custom",
      "models": {
        "{model}": {
          "limit": { "context": 128000, "output": 32000 }
        }
      }
    }
  }
}`,
      },
    ],
    notes: [
      "kind 用 anthropic(router 支持 /v1/messages);用 openai 时 baseURL 改为 {endpoint}",
      "与内置 provider 并存,不影响原有 BigModel/Z.ai 配置",
    ],
    verified: "按本机 ZCode v2 配置实测结构生成,2026-09 核对",
  },
  {
    id: "qwencode",
    name: "Qwen Code",
    vendor: "阿里",
    group: "domestic",
    protocol: "OpenAI 兼容",
    logo: qwenLogo,
    iconText: "Q",
    summary: "命令行编程 Agent,环境变量接入 OpenAI 兼容端点",
    steps: [
      "在 ~/.qwen/.env(或系统环境变量)中设置下方三项",
      "启动 qwen 即走本地代理",
    ],
    snippets: [
      {
        label: "~/.qwen/.env",
        lang: "env",
        content: `OPENAI_API_KEY={key}
OPENAI_BASE_URL={endpoint}
OPENAI_MODEL={model}`,
      },
    ],
    notes: ["每次调用真实扣 CoStrict Credit,大任务请留意额度"],
    verified: "按 Qwen Code OpenAI 兼容接入口径整理",
  },
  // ================= 国际 =================
  {
    id: "claude-code",
    name: "Claude Code",
    vendor: "Anthropic",
    group: "international",
    protocol: "Anthropic 兼容",
    logo: claudeLogo,
    iconText: "CC",
    summary: "命令行编程 Agent,走 Anthropic 协议",
    steps: [
      "方式一:settings.json 写入 env(推荐,长期生效)",
      "方式二:临时环境变量后启动 claude",
    ],
    snippets: [
      {
        label: "~/.claude/settings.json",
        lang: "json",
        content: `{
  "env": {
    "ANTHROPIC_BASE_URL": "{origin}",
    "ANTHROPIC_AUTH_TOKEN": "{key}"
  }
}`,
      },
      {
        label: "PowerShell 临时环境变量",
        lang: "cmd",
        content: `$env:ANTHROPIC_BASE_URL="{origin}"
$env:ANTHROPIC_AUTH_TOKEN="{key}"
claude`,
      },
    ],
    notes: ["模型名用模型页中的 ID,可用 --model 指定"],
    verified: "Claude Code 官方 LLM 网关配置口径",
  },
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    group: "international",
    protocol: "OpenAI 兼容",
    logo: openaiLogo,
    iconText: "CX",
    summary: "命令行编程 Agent,支持自定义 model provider",
    steps: [
      "方式一:点下方按钮,由 costrict-router 自动写入 Codex 配置",
      "方式二:手动编辑 ~/.codex/config.toml 并设置环境变量",
    ],
    snippets: [
      {
        label: "~/.codex/config.toml",
        lang: "toml",
        content: `model = "{model}"
model_provider = "costrict"

[model_providers.costrict]
name = "CoStrict (Hub)"
base_url = "{endpoint}"
wire_api = "chat"
env_key = "COSTRICT_API_KEY"`,
      },
      { label: "环境变量", lang: "env", content: `COSTRICT_API_KEY={key}` },
    ],
    notes: ["router 也支持 wire_api = \"responses\";自动写入由 codex-catalog 完成"],
    verified: "Codex 官方 model_providers 口径 + router codex-catalog 命令",
    action: "codex-catalog",
  },
  {
    id: "cline-roo",
    shortName: "Cline · Roo",
    name: "Cline / Roo Code",
    vendor: "VSCode 插件",
    group: "international",
    protocol: "OpenAI 兼容",
    logo: clineLogo,
    iconText: "CR",
    summary: "VSCode 编程 Agent 插件,表单式配置",
    steps: [
      "插件设置 → API Provider 选「OpenAI Compatible」",
      "Base URL 填 {endpoint},API Key 填 {key}",
      "Model ID 填 {model}",
    ],
    snippets: [
      { label: "Base URL", lang: "text", content: "{endpoint}" },
      { label: "API Key", lang: "text", content: "{key}" },
      { label: "Model ID", lang: "text", content: "{model}" },
    ],
    verified: "Cline/Roo 通用 OpenAI Compatible 口径",
  },
  // ================= 通用 =================
  {
    id: "generic-openai",
    shortName: "OpenAI",
    name: "任意 OpenAI 兼容客户端",
    vendor: "通用",
    group: "generic",
    protocol: "OpenAI 兼容",
    logo: openaiLogo,
    iconText: "OA",
    summary: "三要素接入:端点 + Key + 模型名",
    steps: ["把三要素填进任意支持自定义 OpenAI 端点的工具即可"],
    snippets: [
      { label: "Base URL", lang: "text", content: "{endpoint}" },
      { label: "API Key", lang: "text", content: "{key}" },
      { label: "模型名", lang: "text", content: "{model}" },
      { label: "请求示例", lang: "cmd", content: `curl {endpoint}/chat/completions \\\n  -H "Authorization: Bearer {key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"{model}","messages":[{"role":"user","content":"你好"}]}'` },
    ],
    verified: "costrict-router /v1/chat/completions 原生透传",
  },
  {
    id: "generic-anthropic",
    shortName: "Anthropic",
    name: "任意 Anthropic 兼容客户端",
    vendor: "通用",
    group: "generic",
    protocol: "Anthropic 兼容",
    logo: claudeLogo,
    iconText: "AA",
    summary: "router 本地转换 Anthropic 协议",
    steps: ["base URL 指向本地服务,鉴权走 x-api-key 或 Bearer"],
    snippets: [
      { label: "Base URL", lang: "text", content: "{origin}" },
      { label: "Messages 端点", lang: "text", content: "{origin}/v1/messages" },
      { label: "API Key(x-api-key / Bearer 均可)", lang: "text", content: "{key}" },
    ],
    verified: "costrict-router /v1/messages 本地协议转换",
  },
];

/** 页尾提示:明确不支持自定义模型的国产工具,避免用户踩坑 */
export const UNSUPPORTED_TOOLS = [
  { name: "通义灵码", reason: "深度绑定通义千问,对话界面无自定义模型入口" },
  { name: "Qoder", reason: "未见公开的自定义模型/端点配置能力" },
  { name: "文心快码 Comate", reason: "企业版私有化接入为主,个人版无自定义端点入口" },
];

export function renderTemplate(tpl: string, vars: { origin: string; key: string; model: string }): string {
  return tpl
    .replaceAll("{origin}", vars.origin)
    .replaceAll("{endpoint}", `${vars.origin}/v1`)
    .replaceAll("{key}", vars.key || "<未获取到 Key,请在仪表盘查看>")
    .replaceAll("{model}", vars.model);
}
