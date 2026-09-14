import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/bridge";
import { AGENT_ENTRIES, UNSUPPORTED_TOOLS, renderTemplate, type AgentEntry } from "../lib/agents";
import type { StatusInfo } from "../lib/types";
import { Btn, Card, CodeBlock, Empty, Pill } from "../components/ui";

const GROUPS: { id: AgentEntry["group"]; label: string }[] = [
  { id: "domestic", label: "国产工具" },
  { id: "international", label: "国际工具" },
  { id: "generic", label: "通用接入" },
];

export default function AgentsPage({ status }: { status: StatusInfo | null }) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");
  const [hideKey, setHideKey] = useState(false);
  const [key, setKey] = useState<string>("");
  const [catalogOut, setCatalogOut] = useState<string | null>(null);

  const endpoint = status?.localEndpoint ?? "http://127.0.0.1:14567/v1";
  const origin = endpoint.replace(/\/v1$/, "");

  useEffect(() => {
    api.getModels().then((ms) => {
      setModels(ms.map((m) => m.id));
      setModel((cur) => cur || ms[0]?.id || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getKey().then((k) => setKey(k.key ?? "")).catch(() => {});
  }, [status?.keyPresent]);

  const vars = useMemo(() => ({ origin, key: hideKey ? "sk-costrict-****（点击复制时请先开启显示）" : key, model }), [origin, key, model, hideKey]);

  const runCatalog = async () => {
    try {
      const out = await api.codexCatalog();
      setCatalogOut(out);
    } catch (e) {
      setCatalogOut(String(e));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>接入</h2>
        <Pill tone="neutral">把 CoStrict 额度接到你的 AI 工具</Pill>
      </div>

      <Card className="agents-bar">
        <div className="agents-bar-row">
          <label className="agents-label">模型</label>
          {models.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <code className="muted">{model || "未获取到模型(可手填)"}</code>
          )}
          <label className="agents-label">Key</label>
          <code className="agents-key">{hideKey ? "••••••••" : key || "未获取"}</code>
          <button className="link-btn" onClick={() => setHideKey((h) => !h)}>
            {hideKey ? "显示" : "隐藏"}
          </button>
          <span className="flex-1" />
          <code className="muted">{endpoint}</code>
        </div>
        <p className="hint">下方片段已自动代入端点、Key 和所选模型,复制即用。</p>
      </Card>

      {GROUPS.map((g) => (
        <div key={g.id} className="agent-group">
          <h3 className="group-title">{g.label}</h3>
          <div className="agent-grid">
            {AGENT_ENTRIES.filter((e) => e.group === g.id).map((entry) => (
              <AgentCard key={entry.id} entry={entry} vars={vars} onCatalog={entry.action === "codex-catalog" ? runCatalog : undefined} />
            ))}
          </div>
        </div>
      ))}

      <Card title="这些工具暂不支持自定义模型">
        <ul className="unsupported-list">
          {UNSUPPORTED_TOOLS.map((t) => (
            <li key={t.name}>
              <b>{t.name}</b>:{t.reason}
            </li>
          ))}
        </ul>
      </Card>

      {catalogOut && (
        <Card title="codex-catalog 输出">
          <pre className="test-out">{catalogOut}</pre>
        </Card>
      )}
      {!status?.keyPresent && <Empty text="提示:尚未捕获本地 Key,片段中的 Key 为占位符。" />}
    </div>
  );
}

function AgentCard({
  entry,
  vars,
  onCatalog,
}: {
  entry: AgentEntry;
  vars: { origin: string; key: string; model: string };
  onCatalog?: () => void;
}) {
  return (
    <Card className="agent-card">
      <header className="agent-head">
        <span className="agent-icon">{entry.iconText}</span>
        <div className="agent-title">
          <div className="agent-name">{entry.name}</div>
          <div className="agent-vendor">{entry.vendor}</div>
        </div>
        <Pill tone="neutral">{entry.protocol}</Pill>
      </header>
      <p className="muted small">{entry.summary}</p>
      <ol className="agent-steps">
        {entry.steps.map((s, i) => (
          <li key={i}>{renderTemplate(s, vars)}</li>
        ))}
      </ol>
      {entry.snippets.map((sn, i) => (
        <CodeBlock key={i} label={sn.label} content={renderTemplate(sn.content, vars)} />
      ))}
      {onCatalog && (
        <div className="row-actions">
          <Btn onClick={onCatalog}>自动写入 Codex 配置(codex-catalog)</Btn>
        </div>
      )}
      {entry.notes?.map((n, i) => (
        <p key={i} className="hint">
          {n}
        </p>
      ))}
      <p className="verified">{entry.verified}</p>
    </Card>
  );
}
