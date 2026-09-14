// Tauri invoke / event 的类型化封装
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  BinaryInfo,
  KeyInfo,
  LoginEvent,
  ModelInfo,
  QuotaSnapshot,
  Settings,
  StartOutcome,
  StatusInfo,
  UsageReport,
} from "./types";

export const api = {
  getStatus: () => invoke<StatusInfo>("get_status"),
  startLogin: (baseUrl: string) => invoke<void>("start_login", { baseUrl }),
  cancelLogin: () => invoke<void>("cancel_login"),
  startService: () => invoke<StartOutcome>("start_service"),
  stopService: () => invoke<void>("stop_service"),
  restartService: () => invoke<StartOutcome>("restart_service"),
  getKey: () => invoke<KeyInfo>("get_key"),
  resetKey: () => invoke<string | null>("reset_key"),
  getQuota: () => invoke<QuotaSnapshot>("get_quota"),
  getModels: () => invoke<ModelInfo[]>("get_models"),
  getUsage: (days = 7) => invoke<UsageReport>("get_usage", { days }),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  codexCatalog: () => invoke<string>("codex_catalog"),
  testModel: (model: string) => invoke<string>("test_model", { model }),
  getBinaryInfo: () => invoke<BinaryInfo>("get_binary_info"),
  downloadBinary: () => invoke<string>("download_binary"),
  openAppPath: (kind: string) => invoke<void>("open_app_path", { kind }),
};

export function onStatus(cb: (s: StatusInfo) => void): Promise<UnlistenFn> {
  return listen<StatusInfo>("hub:status", (e) => cb(e.payload));
}

export function onLoginEvent(cb: (e: LoginEvent) => void): Promise<UnlistenFn> {
  return listen<LoginEvent>("hub:login", (e) => cb(e.payload));
}

export function onQuota(cb: (q: QuotaSnapshot) => void): Promise<UnlistenFn> {
  return listen<QuotaSnapshot>("hub:quota", (e) => cb(e.payload));
}

export function onDownload(cb: (m: { message: string }) => void): Promise<UnlistenFn> {
  return listen<{ message: string }>("hub:download", (e) => cb(e.payload));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
