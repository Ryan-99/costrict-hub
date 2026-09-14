import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/bridge";
import { AGENT_ENTRIES, UNSUPPORTED_TOOLS, renderTemplate, type AgentEntry } from "../lib/agents";
import type { Settings, StatusInfo } from "../lib/types";
import { Btn, Card, CodeBlock, Empty, Pill } from "../components/ui";

const GROUPS: { id: AgentEntry["group"]; label: string }[] = [
  { id: "domestic", label: "国产工具" },
  { id: "international", label: "国际工具" },
  { id: "generic", label: "通用" },
];

export default function AgentsPage({
  status,
  settings,
  onSettingsChanged,
}: {
  status: StatusInfo | null;
  settings: Settings | null;
  onSettingsChanged: (patch: Partial<Settings>) => Promise<unknown>;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>(settings?.defaultModel || "Auto");
  const [hideKey, setHideKey] = useState(false);
  const [key, setKey] = useState<string>("");
  const [catalogOut, setCatalogOut] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("workbuddy");

  useEffect(() => {
    if (settings?.defaultModel) setModel(settings.defaultModel);
  }, [settings?.defaultModel]);

  const endpoint = status?.localEndpoint ?? "http://127.0.0.1:14567/v1";
  const origin = endpoint.replace(/\/v1$/, "");

  useEffect(() => {
    api
      .getModels()
      .then((ms) => setModels(ms.map((m) => m.id)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.getKey().then((k) => setKey(k.key ?? "")).catch(() => {});
  }, [status?.keyPresent]);

  const changeModel = (m: string) => {
    setModel(m);
    onSettingsChanged({ defaultModel: m }).catch(() => {});
  };

  const vars = useMemo(
    () => ({ origin, key: hideKey ? "sk-costrict-****(复制时请先点显示)" : key, model }),
    [origin, key, model, hideKey],
  );

  const runCatalog = async () => {
    try {
      const out = await api.codexCatalog();
      setCatalogOut(out);
    } catch (e) {
      setCatalogOut(String(e));
    }
  };

  const selected = AGENT_ENTRIES.find((e) => e.id === selectedId) ?? AGENT_ENTRIES[0];

  return (
    <div className="page">
      <div className="page-head">
        <h2>接入</h2>
        <Pill tone="neutral">把 CoStrict 额度接到你的 AI 工具</Pill>
      </div>

      {/* logo 选择架:点图标切换下方详细配置 */}
      <Card className="shelf-card">
        {GROUPS.map((g) => {
          const entries = AGENT_ENTRIES.filter((e) => e.group === g.id);
          if (entries.length === 0) return null;
          return (
            <div key={g.id} className="shelf-row">
              <span className="shelf-group">{g.label}</span>
              <div className="shelf-tiles">
                {entries.map((entry) => (
                  <ShelfTile
                    key={entry.id}
                    entry={entry}
                    active={entry.id === selectedId}
                    onClick={() => setSelectedId(entry.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <p className="hint">点 logo 查看对应工具的详细接入方法;片段已代入下方端点、Key 和默认模型,复制即用。</p>
      </Card>

      {/* 参数条 */}
      <Card className="agents-bar">
        <div className="agents-bar-row">
          <label className="agents-label">默认模型</label>
          {models.length > 0 ? (
            <select value={models.includes(model) ? model : models[0]} onChange={(e) => changeModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <code className="muted">{model}(未获取到模型列表)</code>
          )}
          <span className="flex-1" />
          <label className="agents-label">API Key</label>
          <code className="agents-key">{hideKey ? "••••••••" : key || "未获取"}</code>
          <button className="link-btn" onClick={() => setHideKey((h) => !h)}>
            {hideKey ? "显示" : "隐藏"}
          </button>
          <code className="muted">{endpoint}</code>
        </div>
      </Card>

      {/* 选中工具的详细配置 */}
      <AgentCard
        entry={selected}
        vars={vars}
        onCatalog={selected.action === "codex-catalog" ? runCatalog : undefined}
      />

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

function ShelfTile({ entry, active, onClick }: { entry: AgentEntry; active: boolean; onClick: () => void }) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <button className={`shelf-tile ${active ? "active" : ""}`} onClick={onClick} title={entry.name}>
      {entry.logo && logoOk ? (
        <img className="shelf-logo" src={entry.logo} alt={entry.name} onError={() => setLogoOk(false)} />
      ) : (
        <span className="shelf-logo shelf-letter">{entry.iconText}</span>
      )}
      <span className="shelf-name">{entry.name}</span>
    </button>
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
  const [logoOk, setLogoOk] = useState(true);
  return (
    <Card className="agent-card">
      <header className="agent-head">
        {entry.logo && logoOk ? (
          <img className="agent-logo" src={entry.logo} alt={entry.name} onError={() => setLogoOk(false)} />
        ) : (
          <span className="agent-icon">{entry.iconText}</span>
        )}
        <div className="agent-title">
          <div className="agent-name">{entry.name}</div>
          <div className="agent-vendor">
            {entry.vendor} · {entry.summary}
          </div>
        </div>
        <Pill tone="neutral">{entry.protocol}</Pill>
      </header>
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
          <Btn variant="secondary" onClick={onCatalog}>
            自动写入 Codex 配置(codex-catalog)
          </Btn>
        </div>
      )}
      {entry.notes?.map((n, i) => (
        <p key={i} className="hint">
          {renderTemplate(n, vars)}
        </p>
      ))}
      <p className="verified">{entry.verified}</p>
    </Card>
  );
}
