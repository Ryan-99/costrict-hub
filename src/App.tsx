import { useCallback, useEffect, useState } from "react";
import { api, onStatus, onQuota } from "./lib/bridge";
import type { Page, QuotaSnapshot, Settings, StatusInfo } from "./lib/types";
import Dashboard from "./pages/Dashboard";
import ModelsPage from "./pages/Models";
import AgentsPage from "./pages/Agents";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import costrictIcon from "./assets/logos/costrict-icon.png";
import "./App.css";

const NAV: { id: Page; label: string }[] = [
  { id: "dashboard", label: "仪表盘" },
  { id: "models", label: "模型" },
  { id: "agents", label: "接入" },
  { id: "stats", label: "统计" },
  { id: "settings", label: "设置" },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});
    const unlisteners = [onStatus((s) => setStatus(s)), onQuota((q) => setQuota(q))];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
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
      <aside className="sidebar">
        <div className="logo">
          <img className="logo-img" src={costrictIcon} alt="CoStrict" />
          <div>
            <div className="logo-title">CoStrict Hub</div>
            <div className="logo-sub">额度代理中枢</div>
          </div>
        </div>
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
