import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/bridge";
import { AGENT_ENTRIES, renderTemplate, type AgentEntry } from "../lib/agents";
import type { Settings, StatusInfo } from "../lib/types";
import { Btn, Card, CodeBlock, Pill } from "../components/ui";

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
        <div className="shelf-tiles">
          {AGENT_ENTRIES.map((entry) => (
            <ShelfTile
              key={entry.id}
              entry={entry}
              active={entry.id === selectedId}
              onClick={() => setSelectedId(entry.id)}
            />
          ))}
        </div>
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

      {catalogOut && (
        <Card title="codex-catalog 输出">
          <pre className="test-out">{catalogOut}</pre>
        </Card>
      )}
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
      <span className="shelf-name">{entry.shortName ?? entry.name}</span>
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
          <div className="agent-vendor">{entry.vendor}</div>
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
    </Card>
  );
}
