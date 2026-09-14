import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, onLoginEvent } from "../lib/bridge";
import type { LoginEvent, QuotaSnapshot, Settings, StatusInfo } from "../lib/types";
import { Btn, ConfirmBar, Empty, Pill, fmtNum } from "../components/ui";
import costrictIcon from "../assets/logos/costrict-icon.png";

export default function Dashboard({
  status,
  quota,
  settings,
  onSettingsChanged,
  onChanged,
}: {
  status: StatusInfo | null;
  quota: QuotaSnapshot | null;
  settings: Settings | null;
  onSettingsChanged: (patch: Partial<Settings>) => Promise<unknown>;
  onChanged: () => void;
}) {
  if (!status) return <Empty text="加载中…" />;
  return (
    <div className="page">
      <div className="page-head">
        <h2>仪表盘</h2>
        <Pill tone={status.serviceRunning ? "ok" : status.loggedIn ? "warn" : "neutral"}>
          {status.serviceRunning ? "服务运行中" : status.loggedIn ? "服务未运行" : "未认证"}
        </Pill>
      </div>

      <HeroCard status={status} onChanged={onChanged} />

      <AccessCard status={status} settings={settings} onSettingsChanged={onSettingsChanged} onChanged={onChanged} />

      <div className="grid-2">
        <QuotaCard quota={quota} loggedIn={status.loggedIn} upstream={status.upstreamBaseUrl} />
        <TodayCard />
      </div>
    </div>
  );
}

/* ---------------- 认证 + 服务(hero) ---------------- */

function HeroCard({ status, onChanged }: { status: StatusInfo; onChanged: () => void }) {
  const [panelOpen, setPanelOpen] = useState(!status.loggedIn);
  const [stage, setStage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [svcBusy, setSvcBusy] = useState(false);
  const [svcMsg, setSvcMsg] = useState<string | null>(null);
  const unRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onLoginEvent((e: LoginEvent) => {
      setStage(e.stage);
      setMessage(e.message);
      if (e.stage === "error") setError(e.message ?? "登录失败");
      if (e.stage === "done" || e.stage === "error" || e.stage === "cancelled") {
        setBusy(false);
        if (e.stage === "done") onChanged();
      }
    }).then((un) => (unRef.current = un));
    return () => unRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLogin = async (baseUrl: string) => {
    setError(null);
    setBusy(true);
    setStage("starting");
    try {
      await api.startLogin(baseUrl);
    } catch (e) {
      setBusy(false);
      setError(String(e));
    }
  };

  const runService = async (fn: () => Promise<unknown>, okText: string) => {
    setSvcBusy(true);
    setSvcMsg(null);
    try {
      await fn();
      setSvcMsg(okText);
      onChanged();
    } catch (e) {
      setSvcMsg(String(e));
    } finally {
      setSvcBusy(false);
    }
  };

  return (
    <section className="hero-card">
      <div className="hero-row">
        <img className="hero-logo" src={costrictIcon} alt="CoStrict" />
        <div className="hero-main">
          <div className="hero-title-row">
            <span className="hero-title">CoStrict 账号</span>
            {status.loggedIn ? <Pill tone="ok">✓ 已认证</Pill> : <Pill tone="warn">未认证</Pill>}
          </div>
          <div className="hero-sub">
            CoStrict
            <span className="hero-dot">·</span>
            {status.upstreamBaseUrl ?? "尚未登录"}
            <span className="hero-dot">·</span>
            router {status.binaryVersion ?? "未安装"}
            <span className="hero-dot">·</span>
            {status.serviceRunning ? "服务运行中" : "服务未运行"}
          </div>
        </div>
        <div className="hero-actions">
          {status.loggedIn ? (
            <Btn variant="ghost" onClick={() => setPanelOpen((o) => !o)}>
              重新认证
            </Btn>
          ) : (
            <Btn variant="primary" onClick={() => setPanelOpen(true)}>
              登录 CoStrict
            </Btn>
          )}
          {!status.serviceRunning ? (
            <Btn
              variant="secondary"
              disabled={svcBusy || !status.loggedIn || !status.binaryPresent}
              onClick={() => runService(() => api.startService(), "服务已启动")}
            >
              启动服务
            </Btn>
          ) : (
            <Btn variant="danger-ghost" disabled={svcBusy} onClick={() => runService(() => api.stopService(), "服务已停止")}>
              停止服务
            </Btn>
          )}
        </div>
      </div>

      {panelOpen && (
        <div className="hero-panel">
          <div className="hero-panel-inner">
            <div className="form-row">
              <LoginFields defaultUrl={status.configuredBaseUrl} disabled={busy} onStart={startLogin} busy={busy} onCancel={() => api.cancelLogin()} />
            </div>
            {busy && (
              <div className="login-progress">
                <span className="spinner" />
                <span>{message ?? "正在生成登录链接…"}</span>
              </div>
            )}
            {error && <p className="error-text">{error}</p>}
            {stage === "done" && (
              <p className="hint">
                认证完成。
                <button
                  className="link-btn"
                  onClick={() => {
                    setPanelOpen(false);
                    setStage(null);
                  }}
                >
                  收起
                </button>
              </p>
            )}
          </div>
        </div>
      )}
      {svcMsg && <p className="hint">{svcMsg}</p>}
      {!status.binaryPresent && <p className="error-text">未找到 costrict-router 二进制,请到「设置」下载安装。</p>}
    </section>
  );
}

function LoginFields({
  defaultUrl,
  disabled,
  busy,
  onStart,
  onCancel,
}: {
  defaultUrl: string;
  disabled: boolean;
  busy: boolean;
  onStart: (url: string) => void;
  onCancel: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(defaultUrl || "https://zgsm.sangfor.com");
  return (
    <>
      <label>服务地址</label>
      <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://zgsm.sangfor.com" disabled={disabled} />
      {!busy ? (
        <Btn variant="primary" onClick={() => onStart(baseUrl.trim())}>
          打开浏览器登录
        </Btn>
      ) : (
        <Btn variant="ghost" onClick={onCancel}>
          取消
        </Btn>
      )}
    </>
  );
}

/* ---------------- 本地接入(三要素) ---------------- */

function AccessCard({
  status,
  settings,
  onSettingsChanged,
  onChanged,
}: {
  status: StatusInfo;
  settings: Settings | null;
  onSettingsChanged: (patch: Partial<Settings>) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getKey().then((k) => setKey(k.key));
  }, [status.keyPresent]);

  useEffect(() => {
    api
      .getModels()
      .then((ms) => setModels(ms.map((m) => m.id)))
      .catch(() => {});
  }, []);

  const copy = async (label: string, value: string) => {
    const { copyText } = await import("../lib/bridge");
    if (await copyText(value)) {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    }
  };

  const resetKey = async () => {
    setConfirmReset(false);
    setMsg(null);
    try {
      const nk = await api.resetKey();
      setMsg(nk ? "新 key 已签发并生效,记得更新各工具里的配置。" : "key reset 已执行。");
      onChanged();
    } catch (e) {
      setMsg(String(e));
    }
  };

  const defaultModel = settings?.defaultModel || "Auto";
  const modelValue = models.includes(defaultModel) ? defaultModel : models[0] ?? defaultModel;

  return (
    <section className="card">
      <header className="card-head">
        <h3>本地接入</h3>
      </header>
      <div className="trio">
        <div className="trio-item">
          <span className="trio-label">接入地址</span>
          <div className="trio-value">
            <code title={status.localEndpoint}>{status.localEndpoint}</code>
            <button className="chip-btn" onClick={() => copy("endpoint", status.localEndpoint)}>
              {copied === "endpoint" ? "已复制" : "复制"}
            </button>
          </div>
        </div>
        <div className="trio-item">
          <span className="trio-label">API Key</span>
          <div className="trio-value">
            <code title={key ?? undefined}>
              {key ? (keyRevealed ? key : key.slice(0, 10) + "•".repeat(12)) : "登录后签发,详见下方说明"}
            </code>
            {key && (
              <>
                <button className="chip-btn" onClick={() => setKeyRevealed((r) => !r)}>
                  {keyRevealed ? "隐藏" : "显示"}
                </button>
                <button className="chip-btn" onClick={() => copy("key", key)}>
                  {copied === "key" ? "已复制" : "复制"}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="trio-item">
          <span className="trio-label">默认模型</span>
          <div className="trio-value">
            {models.length > 0 ? (
              <select
                className="trio-select"
                value={modelValue}
                onChange={(e) => onSettingsChanged({ defaultModel: e.target.value }).catch(() => {})}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <code>{defaultModel}</code>
            )}
          </div>
        </div>
      </div>
      {status.keyFromFallback && <p className="hint">⚠ 当前 key 以文件形式保存在数据目录(系统凭据库不可用)。</p>}
      <div className="trio-foot">
        <span className="flex-1" />
        <button className="link-btn danger-link" disabled={!key} onClick={() => setConfirmReset(true)}>
          重签 Key(key reset)
        </button>
      </div>
      {msg && <p className="hint">{msg}</p>}
      <ConfirmBar
        show={confirmReset}
        message="重签 Key 会让当前 key 立即失效,已按旧 key 配置的工具(Trae、Cline、Claude Code 等)都会 401,需要逐个更新。确定继续?"
        confirmText="重签"
        onConfirm={resetKey}
        onCancel={() => setConfirmReset(false)}
      />
    </section>
  );
}

/* ---------------- 额度 ---------------- */

function QuotaCard({ quota, loggedIn, upstream }: { quota: QuotaSnapshot | null; loggedIn: boolean; upstream: string | null }) {
  const [refreshing, setRefreshing] = useState(false);
  if (!loggedIn) {
    return (
      <Card title="Credit 额度">
        <Empty text="认证后展示额度" />
      </Card>
    );
  }
  const total = quota?.totalQuota ?? null;
  const used = quota?.usedQuota ?? null;
  const pct = total && used !== null && total > 0 ? Math.min((used / total) * 100, 100) : null;
  const openCredits = async () => {
    if (!upstream) return;
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(`${upstream}/credit/manager`).catch(() => {});
  };
  return (
    <Card
      title="Credit 额度"
      extra={
        <Btn
          variant="ghost"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await api.getQuota().catch(() => {});
            setRefreshing(false);
          }}
        >
          刷新
        </Btn>
      }
    >
      {quota?.error ? (
        <p className="error-text">{quota.error}</p>
      ) : total !== null && used !== null ? (
        <>
          <div className="quota-bar">
            <div className="quota-fill" style={{ width: `${pct ?? 0}%` }} />
          </div>
          <div className="quota-nums">
            <div>
              <div className="quota-big">{fmtNum(Math.max(total - used, 0))}</div>
              <div className="quota-cap">剩余 Credit</div>
            </div>
            <div className="quota-side">
              <div>已用 {fmtNum(used)}</div>
              <div>总额 {fmtNum(total)}</div>
              {pct !== null && <div>用量 {pct.toFixed(1)}%</div>}
            </div>
          </div>
          {quota?.isStar === "false" && (
            <p className="hint">
              Star 官方 GitHub 仓库可领额度:
              <button className="link-btn" onClick={openCredits}>
                查看活动
              </button>
            </p>
          )}
        </>
      ) : (
        <Empty text="等待首次刷新…" />
      )}
    </Card>
  );
}

function Card({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h3>{title}</h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

/* ---------------- 今日用量 ---------------- */

function TodayCard() {
  const [today, setToday] = useState<{ calls: number; tokens: number } | null>(null);
  useEffect(() => {
    const load = () =>
      api
        .getUsage(1)
        .then((r) => setToday({ calls: r.totalCalls, tokens: r.totalTokens }))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card title="今日用量">
      {today && today.calls > 0 ? (
        <div className="today-grid">
          <div>
            <div className="quota-big">{fmtNum(today.calls)}</div>
            <div className="quota-cap">调用次数</div>
          </div>
          <div>
            <div className="quota-big">{fmtNum(today.tokens)}</div>
            <div className="quota-cap">Token</div>
          </div>
        </div>
      ) : (
        <Empty text="今天还没有调用" />
      )}
    </Card>
  );
}
