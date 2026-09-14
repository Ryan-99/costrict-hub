import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, onStatus, onQuota } from "./lib/bridge";
import type { Page, QuotaSnapshot, Settings, StatusInfo } from "./lib/types";
import Dashboard from "./pages/Dashboard";
import ModelsPage from "./pages/Models";
import AgentsPage from "./pages/Agents";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import hubIcon from "./assets/logos/hub-icon.svg";
import "./App.css";

const NAV: { id: Page; label: string }[] = [
  { id: "dashboard", label: "仪表盘" },
  { id: "models", label: "模型" },
  { id: "agents", label: "接入" },
  { id: "stats", label: "统计" },
  { id: "settings", label: "设置" },
];

const appWindow = getCurrentWindow();

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});
    const unlisteners = [onStatus((s) => setStatus(s)), onQuota((q) => setQuota(q))];
    // 跟踪最大化状态,切换最大化/还原图标
    const update = () => appWindow.isMaximized().then(setMaxed).catch(() => {});
    update();
    const pResized = appWindow.onResized(() => window.setTimeout(update, 50));
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
      pResized.then((fn) => fn());
    };
  }, []);

  const refreshStatus = useCallback(() => {
    api.getStatus().then(setStatus).catch(() => {});
    setReloadFlag((n) => n + 1);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return settings;
      const next = await api.saveSettings({ ...settings, ...patch });
      setSettings(next);
      return next;
    },
    [settings],
  );

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <img className="titlebar-icon" src={hubIcon} alt="" aria-hidden />
        <span className="titlebar-title">CoStrict Hub</span>
        <span className="flex-1" data-tauri-drag-region />
        <button className="win-btn" title="最小化" onClick={() => appWindow.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className="win-btn" title={maxed ? "还原" : "最大化"} onClick={() => appWindow.toggleMaximize()}>
          {maxed ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2.8 2.5V1a.9.9 0 0 1 .9-.9H9a.9.9 0 0 1 .9.9v5.3a.9.9 0 0 1-.9.9H7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.7" y="0.7" width="8.6" height="8.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button className="win-btn close" title="关闭并隐藏到托盘" onClick={() => appWindow.hide()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <nav>
            {NAV.map((n) => (
              <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                {n.label}
              </button>
            ))}
          </nav>
          <StatusFoot status={status} />
        </aside>
        <main className="content">
          {page === "dashboard" && (
            <Dashboard
              status={status}
              quota={quota}
              settings={settings}
              onSettingsChanged={updateSettings}
              onChanged={refreshStatus}
            />
          )}
          {page === "models" && <ModelsPage status={status} />}
          {page === "agents" && (
            <AgentsPage status={status} settings={settings} onSettingsChanged={updateSettings} />
          )}
          {page === "stats" && <StatsPage status={status} reloadFlag={reloadFlag} />}
          {page === "settings" && (
            <SettingsPage settings={settings} setSettings={setSettings} onChanged={refreshStatus} />
          )}
        </main>
      </div>
    </div>
  );
}

function StatusFoot({ status }: { status: StatusInfo | null }) {
  if (!status) return null;
  const dot = status.serviceRunning ? "ok" : status.loggedIn ? "warn" : "idle";
  const text = status.serviceRunning ? "服务运行中" : status.loggedIn ? "已认证 · 服务未运行" : "未认证";
  return (
    <div className="sidebar-foot">
      <span className={`dot ${dot}`} />
      <span>{text}</span>
    </div>
  );
}
