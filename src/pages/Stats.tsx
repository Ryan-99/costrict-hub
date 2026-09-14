import { useEffect, useState } from "react";
import { api } from "../lib/bridge";
import type { StatusInfo, UsageReport } from "../lib/types";
import { Btn, Card, Empty, Pill, fmtNum } from "../components/ui";

export default function StatsPage({ status, reloadFlag }: { status: StatusInfo | null; reloadFlag: number }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getUsage(days)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [days, reloadFlag]);

  const maxCalls = Math.max(...(report?.daily.map((d) => d.calls) ?? [0]), 1);

  return (
    <div className="page">
      <div className="page-head">
        <h2>统计</h2>
        <div className="row-actions">
          <Pill tone={status?.serviceRunning ? "ok" : "neutral"}>{status?.serviceRunning ? "采集中" : "服务未运行"}</Pill>
          {[7, 30].map((d) => (
            <Btn key={d} variant={days === d ? "primary" : "ghost"} onClick={() => setDays(d as 7 | 30)}>
              {d} 天
            </Btn>
          ))}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="grid-3">
        <Card>
          <div className="quota-big">{report ? fmtNum(report.totalCalls) : "–"}</div>
          <div className="quota-cap">总调用({days} 天)</div>
        </Card>
        <Card>
          <div className="quota-big">{report ? fmtNum(report.totalTokens) : "–"}</div>
          <div className="quota-cap">总 Token</div>
        </Card>
        <Card>
          <div className="quota-big">{report ? fmtNum(report.daily.reduce((s, d) => s + d.errorCalls, 0)) : "–"}</div>
          <div className="quota-cap">错误调用(HTTP ≥ 400)</div>
        </Card>
      </div>

      <Card title="按天调用量">
        {report && report.daily.length > 0 ? (
          <div className="chart">
            {report.daily.map((d) => (
              <div key={d.day} className="chart-col" title={`${d.day}: ${d.calls} 次 / ${fmtNum(d.totalTokens)} tok`}>
                <div className="chart-bar" style={{ height: `${Math.max((d.calls / maxCalls) * 100, 2)}%` }} />
                <div className="chart-label">{d.day.slice(5)}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="暂无数据。服务需由 Hub 以 --debug 启动才会记录对话指标。" />
        )}
      </Card>

      <Card title="最近请求">
        {report && report.recent.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>模型</th>
                <th>状态</th>
                <th>输入</th>
                <th>输出</th>
                <th>耗时</th>
                <th>流式</th>
              </tr>
            </thead>
            <tbody>
              {report.recent.map((r) => (
                <tr key={r.ts + r.id}>
                  <td className="muted">{r.ts.slice(11)}</td>
                  <td>
                    <code>{r.model}</code>
                  </td>
                  <td>
                    <Pill tone={r.status >= 400 ? "bad" : "ok"}>{r.status}</Pill>
                  </td>
                  <td>{fmtNum(r.promptTokens)}</td>
                  <td>{fmtNum(r.completionTokens)}</td>
                  <td>{r.durationMs >= 1000 ? `${(r.durationMs / 1000).toFixed(1)}s` : `${Math.round(r.durationMs)}ms`}</td>
                  <td>{r.stream ? "✓" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text="还没有请求记录" />
        )}
      </Card>
    </div>
  );
}
