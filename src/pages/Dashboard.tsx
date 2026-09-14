import { useEffect, useRef, useState } from "react";
import { api, onLoginEvent } from "../lib/bridge";
import type { LoginEvent, QuotaSnapshot, StatusInfo } from "../lib/types";
import { Btn, Card, ConfirmBar, CopyRow, Empty, Pill, fmtNum } from "../components/ui";

export default function Dashboard({
  status,
  quota,
  onChanged,
}: {
  status: StatusInfo | null;
  quota: QuotaSnapshot | null;
  onChanged: () => void;
}) {
  if (!status) return <Empty text="加载中…" />;
  return (
    <div className="page">
      <div className="page-head">
        <h2>仪表盘</h2>
        <Pill tone={status.serviceRunning ? "ok" : status.loggedIn ? "warn" : "neutral"}>
          {status.serviceRunning ? "服务运行中" : status.loggedIn ? "服务未运行" : "未登录"}
        </Pill>
      </div>

      {!status.loggedIn && <LoginCard status={status} onChanged={onChanged} />}

      <div className="grid-2">
        <ServiceCard status={status} onChanged={onChanged} />
        <QuotaCard quota={quota} loggedIn={status.loggedIn} upstream={status.upstreamBaseUrl} />
      </div>

      {status.loggedIn && (
        <div className="grid-2">
          <KeyCard status={status} onChanged={onChanged} />
          <TodayCard />
        </div>
      )}
    </div>
  );
}

/* ---------------- 登录 ---------------- */

function LoginCard({ status, onChanged }: { status: StatusInfo; onChanged: () => void }) {
  const [baseUrl, setBaseUrl] = useState(status.configuredBaseUrl || "https://zgsm.sangfor.com");
  const [stage, setStage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const start = async () => {
    setError(null);
    setBusy(true);
    setStage("starting");
    try {
      await api.startLogin(baseUrl.trim());
    } catch (e) {
      setBusy(false);
      setError(String(e));
    }
  };

  return (
    <Card className="login-card" title="接入 CoStrict">
      <p className="muted">
        使用深信服 SSO 登录后,CoStrict 账号的 Credit 额度即可通过本地接口供任意 AI 工具使用。
      </p>
      <div className="form-row">
        <label>服务地址</label>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://zgsm.sangfor.com" disabled={busy} />
      </div>
      {busy ? (
        <div className="login-progress">
          <span className="spinner" />
          <span>{message ?? "正在生成登录链接…"}</span>
          <Btn variant="ghost" onClick={() => api.cancelLogin()}>
            取消
          </Btn>
        </div>
      ) : (
        <div className="row-actions">
          <Btn variant="primary" onClick={start}>
            打开浏览器登录
          </Btn>
        </div>
      )}
      {stage === "url" && <p className="hint">若浏览器未自动打开,请手动访问登录链接(见系统通知)。</p>}
      {error && <p className="error-text">{error}</p>}
    </Card>
  );
}

/* ---------------- 服务 ---------------- */

function ServiceCard({ status, onChanged }: { status: StatusInfo; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(okText);
      onChanged();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="本地服务"
      extra={<Pill tone={status.serviceRunning ? "ok" : "neutral"}>{status.serviceRunning ? "运行中" : "已停止"}</Pill>}
    >
      <div className="kv-list">
        <div className="kv">
          <span>本地端点</span>
          <code>{status.localEndpoint}</code>
        </div>
        <div className="kv">
          <span>上游地址</span>
          <code>{status.upstreamBaseUrl ?? "未登录"}</code>
        </div>
        <div className="kv">
          <span>router 版本</span>
          <code>{status.binaryVersion ?? (status.binaryPresent ? "未知" : "未安装")}</code>
        </div>
        {status.serviceExternal && (
          <p className="hint">服务由其他程序拉起(如 pi-gui),停止/重启会一并接管。</p>
        )}
      </div>
      <div className="row-actions">
        {!status.serviceRunning ? (
          <Btn
            variant="primary"
            disabled={busy || !status.loggedIn || !status.binaryPresent}
            onClick={() => run(() => api.startService(), "服务已启动")}
          >
            启动服务
          </Btn>
        ) : (
          <Btn variant="danger" disabled={busy} onClick={() => run(() => api.stopService(), "服务已停止")}>
            停止服务
          </Btn>
        )}
        <Btn disabled={busy || !status.serviceRunning} onClick={() => run(() => api.restartService(), "服务已重启")}>
          重启
        </Btn>
      </div>
      {!status.binaryPresent && <p className="error-text">未找到 costrict-router 二进制,请到「设置」下载安装。</p>}
      {!status.loggedIn && <p className="hint">先登录 CoStrict 再启动服务。</p>}
      {msg && <p className="hint">{msg}</p>}
    </Card>
  );
}

/* ---------------- Key ---------------- */

function KeyCard({ status, onChanged }: { status: StatusInfo; onChanged: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getKey().then((k) => setKey(k.key));
  }, [status.keyPresent]);

  const reset = async () => {
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

  return (
    <Card title="本地 API Key">
      {key ? (
        <CopyRow label="Key" value={key} mask />
      ) : (
        <p className="hint">尚未捕获本地 key。重新登录或 key reset 可签发。</p>
      )}
      <CopyRow label="端点" value={status.localEndpoint} />
      {status.keyFromFallback && (
        <p className="hint">⚠ 当前 key 以文件形式保存在数据目录(系统凭据库不可用)。</p>
      )}
      <div className="row-actions">
        <Btn variant="danger" disabled={!key} onClick={() => setConfirmReset(true)}>
          重签 Key(key reset)
        </Btn>
      </div>
      <p className="hint">key 只在 router 首次启动时展示一次;重签后旧 key 立即失效,所有已配置的工具都要更新。</p>
      {msg && <p className="hint">{msg}</p>}
      <ConfirmBar
        show={confirmReset}
        message="重签 Key 会让当前 key 立即失效,已按旧 key 配置的工具(Cline、Trae、Claude Code 等)都会 401,需要逐个更新。确定继续?"
        confirmText="重签"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </Card>
  );
}

/* ---------------- 额度 ---------------- */

function QuotaCard({ quota, loggedIn, upstream }: { quota: QuotaSnapshot | null; loggedIn: boolean; upstream: string | null }) {
  const [refreshing, setRefreshing] = useState(false);
  if (!loggedIn) {
    return (
      <Card title="Credit 额度">
        <Empty text="登录后展示额度" />
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
        <Btn variant="ghost" disabled={refreshing} onClick={async () => {
          setRefreshing(true);
          await api.getQuota().catch(() => {});
          setRefreshing(false);
        }}>
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
          <p className="muted small">
            每 15 秒自动刷新
            {quota && ` · 更新于 ${new Date(quota.fetchedAt).toLocaleTimeString("zh-CN")}`}
          </p>
        </>
      ) : (
        <Empty text="等待首次刷新…" />
      )}
    </Card>
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
      <p className="muted small">数据来自 router --debug 日志,覆盖 Hub 拉起服务期间所有工具的调用。</p>
    </Card>
  );
}
