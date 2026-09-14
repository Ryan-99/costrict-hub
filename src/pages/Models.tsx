import { useEffect, useState } from "react";
import { api } from "../lib/bridge";
import type { ModelInfo, StatusInfo } from "../lib/types";
import { Btn, Card, ConfirmBar, Empty, Pill } from "../components/ui";

export default function ModelsPage({ status }: { status: StatusInfo | null }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testOut, setTestOut] = useState<{ model: string; output: string } | null>(null);
  const [confirmModel, setConfirmModel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await api.getModels());
    } catch (e) {
      setError(String(e));
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runTest = async (model: string) => {
    setConfirmModel(null);
    setTesting(model);
    setTestOut(null);
    try {
      const output = await api.testModel(model);
      setTestOut({ model, output });
    } catch (e) {
      setTestOut({ model, output: String(e) });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>模型</h2>
        <div className="row-actions">
          <Pill tone="neutral">{models?.length ?? "…"} 个模型</Pill>
          <Btn variant="ghost" disabled={loading} onClick={load}>
            刷新
          </Btn>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {models === null ? (
        <Empty text="加载中…" />
      ) : models.length === 0 ? (
        <Empty text={status?.loggedIn ? "未获取到模型列表" : "登录后展示模型列表"} />
      ) : (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>模型 ID</th>
                <th>上下文</th>
                <th>最大输出</th>
                <th>图片</th>
                <th>Computer Use</th>
                <th>Credit / 次</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td>
                    <code>{m.id}</code>
                  </td>
                  <td>{m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : "-"}</td>
                  <td>{m.maxTokens ? `${Math.round(m.maxTokens / 1000)}k` : "-"}</td>
                  <td>{m.supportsImages ? "✓" : "-"}</td>
                  <td>{m.supportsComputerUse ? "✓" : "-"}</td>
                  <td>
                    {m.creditConsumption === null || m.creditConsumption < 0 ? (
                      <Pill tone="accent">Auto</Pill>
                    ) : (
                      m.creditConsumption
                    )}
                  </td>
                  <td>
                    <button
                      className="link-btn"
                      disabled={testing !== null}
                      onClick={() => setConfirmModel(m.id)}
                      title="真实发送一条消息验证连通性,会消耗 Credit"
                    >
                      {testing === m.id ? "测试中…" : "测一测"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {testOut && (
        <Card title={`连通自检 · ${testOut.model}`}>
          <pre className="test-out">{testOut.output}</pre>
        </Card>
      )}
      <ConfirmBar
        show={confirmModel !== null}
        message={`「测一测」会向 ${confirmModel ?? ""} 真实发送一条消息,消耗 Credit。继续?`}
        confirmText="发送"
        onConfirm={() => confirmModel && runTest(confirmModel)}
        onCancel={() => setConfirmModel(null)}
      />
    </div>
  );
}
