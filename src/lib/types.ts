// 与 Rust 侧 serde 序列化结构一一对应(camelCase)

export interface StatusInfo {
  binaryPresent: boolean;
  binaryVersion: string | null;
  serviceRunning: boolean;
  serviceExternal: boolean;
  loggedIn: boolean;
  /** 当前 CoStrict 账号显示名(JWT 解出) */
  accountLabel: string | null;
  upstreamBaseUrl: string | null;
  configuredBaseUrl: string;
  keyPresent: boolean;
  keyFromFallback: boolean;
  localEndpoint: string;
}

export interface LoginEvent {
  stage: "starting" | "url" | "waiting" | "starting-service" | "done" | "error" | "cancelled";
  message: string | null;
  url: string | null;
  apiKey: string | null;
}

export interface QuotaSnapshot {
  totalQuota: number | null;
  usedQuota: number | null;
  isStar: string | null;
  fetchedAt: string;
  error: string | null;
}

export interface ModelInfo {
  id: string;
  contextWindow: number;
  maxTokens: number | null;
  supportsImages: boolean;
  supportsComputerUse: boolean;
  /** 每次调用 Credit 消耗;-1/缺失 = Auto */
  creditConsumption: number | null;
}

export interface RequestRecord {
  ts: string;
  day: string;
  id: string;
  model: string;
  stream: boolean;
  status: number;
  messages: number;
  tools: number;
  requestBytes: number;
  responseBytes: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface DayStat {
  day: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorCalls: number;
}

export interface UsageReport {
  daily: DayStat[];
  recent: RequestRecord[];
  totalCalls: number;
  totalTokens: number;
}

export interface Settings {
  upstreamBaseUrl: string;
  port: number;
  defaultModel: string;
  autostartService: boolean;
  stopServiceOnExit: boolean;
}

export interface StartOutcome {
  alreadyRunning: boolean;
  healthy: boolean;
  newKey: string | null;
}

export interface KeyInfo {
  key: string | null;
  fromFallback: boolean;
}

export interface BinaryInfo {
  path: string | null;
  version: string | null;
  sha256: string | null;
  managed: boolean;
}

export type Page = "dashboard" | "models" | "agents" | "stats" | "settings";
