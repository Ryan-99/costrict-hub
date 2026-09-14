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
  steps: string[];
  snippets: AgentSnippet[];
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
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    vendor: "腾讯",
    group: "domestic",
    protocol: "OpenAI 兼容",
    logo: codebuddyLogo,
    iconText: "CB",
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
  },
  {
    id: "trae",
    name: "Trae",
    vendor: "字节跳动",
    group: "domestic",
    protocol: "OpenAI / Anthropic",
    logo: traeLogo,
    iconText: "T",
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
  },
  {
    id: "zcode",
    name: "ZCode",
    vendor: "智谱",
    group: "domestic",
    protocol: "OpenAI / Anthropic",
    logo: zcodeLogo,
    iconText: "Z",
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
  },
  {
    id: "qwencode",
    name: "Qwen Code",
    vendor: "阿里",
    group: "domestic",
    protocol: "OpenAI 兼容",
    logo: qwenLogo,
    iconText: "Q",
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
  },
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    group: "international",
    protocol: "OpenAI 兼容",
    logo: openaiLogo,
    iconText: "CX",
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
    steps: ["把三要素填进任意支持自定义 OpenAI 端点的工具即可"],
    snippets: [
      { label: "Base URL", lang: "text", content: "{endpoint}" },
      { label: "API Key", lang: "text", content: "{key}" },
      { label: "模型名", lang: "text", content: "{model}" },
      { label: "请求示例", lang: "cmd", content: `curl {endpoint}/chat/completions \\\n  -H "Authorization: Bearer {key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"{model}","messages":[{"role":"user","content":"你好"}]}'` },
    ],
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
    steps: ["base URL 指向本地服务,鉴权走 x-api-key 或 Bearer"],
    snippets: [
      { label: "Base URL", lang: "text", content: "{origin}" },
      { label: "Messages 端点", lang: "text", content: "{origin}/v1/messages" },
      { label: "API Key(x-api-key / Bearer 均可)", lang: "text", content: "{key}" },
    ],
  },
];

export function renderTemplate(tpl: string, vars: { origin: string; key: string; model: string }): string {
  return tpl
    .replaceAll("{origin}", vars.origin)
    .replaceAll("{endpoint}", `${vars.origin}/v1`)
    .replaceAll("{key}", vars.key || "<未获取到 Key,请在仪表盘查看>")
    .replaceAll("{model}", vars.model);
}
