import { useEffect, useState } from "react";
import { api, onStatus, onQuota } from "./lib/bridge";
import type { Page, QuotaSnapshot, StatusInfo } from "./lib/types";
import Dashboard from "./pages/Dashboard";
import ModelsPage from "./pages/Models";
import AgentsPage from "./pages/Agents";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
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
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => {});
    const unlisteners = [onStatus((s) => setStatus(s)), onQuota((q) => setQuota(q))];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  // 操作后主动刷新状态的统一入口
  const refreshStatus = () => {
    api.getStatus().then(setStatus).catch(() => {});
    setReloadFlag((n) => n + 1);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-badge">C</span>
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
        {page === "dashboard" && <Dashboard status={status} quota={quota} onChanged={refreshStatus} />}
        {page === "models" && <ModelsPage status={status} />}
        {page === "agents" && <AgentsPage status={status} />}
        {page === "stats" && <StatsPage status={status} reloadFlag={reloadFlag} />}
        {page === "settings" && <SettingsPage onChanged={refreshStatus} />}
      </main>
    </div>
  );
}

function StatusFoot({ status }: { status: StatusInfo | null }) {
  if (!status) return null;
  const dot = status.serviceRunning ? "ok" : status.loggedIn ? "warn" : "idle";
  const text = status.serviceRunning ? "服务运行中" : status.loggedIn ? "已登录 · 服务未运行" : "未登录";
  return (
    <div className="sidebar-foot">
      <span className={`dot ${dot}`} />
      <span>{text}</span>
    </div>
  );
}
