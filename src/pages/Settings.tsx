import { useEffect, useState } from "react";
import { api, onDownload } from "../lib/bridge";
import type { BinaryInfo, Settings as SettingsT } from "../lib/types";
import { Btn, Card, CopyRow, Empty } from "../components/ui";

export default function SettingsPage({
  settings,
  setSettings,
  onChanged,
}: {
  settings: SettingsT | null;
  setSettings: (s: SettingsT) => void;
  onChanged: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [binary, setBinary] = useState<BinaryInfo | null>(null);
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    api.getBinaryInfo().then(setBinary);
  }, []);

  useEffect(() => {
    import("@tauri-apps/plugin-autostart")
      .then((m) => m.isEnabled())
      .then(setAutostart)
      .catch(() => setAutostart(null));
  }, []);

  useEffect(() => {
    const p = onDownload((m) => {
      setDlMsg(m.message);
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  const save = async (patch: Partial<SettingsT>, okText: string) => {
    if (!settings) return;
    setError(null);
    setSaved(null);
    try {
      const next = await api.saveSettings({ ...settings, ...patch });
      setSettings(next);
      setSaved(okText);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleAutostart = async (v: boolean) => {
    const m = await import("@tauri-apps/plugin-autostart");
    if (v) await m.enable();
    else await m.disable();
    setAutostart(await m.isEnabled());
  };

  const download = async () => {
    setDlMsg("开始下载…");
    try {
      const p = await api.downloadBinary();
      setDlMsg(`已安装:${p}`);
      api.getBinaryInfo().then(setBinary);
      onChanged();
    } catch (e) {
      setDlMsg(String(e));
    }
  };

  if (!settings) return <Empty text="加载中…" />;

  return (
    <div className="page">
      <div className="page-head">
        <h2>设置</h2>
        {(saved || error) && <span className={error ? "error-text" : "hint"}>{error ?? saved}</span>}
      </div>

      <Card title="服务">
        <div className="form-row">
          <label>CoStrict 服务地址</label>
          <input
            value={settings.upstreamBaseUrl}
            onChange={(e) => setSettings({ ...settings, upstreamBaseUrl: e.target.value })}
            placeholder="https://zgsm.sangfor.com"
          />
          <Btn variant="secondary" onClick={() => save({ upstreamBaseUrl: settings.upstreamBaseUrl.trim() }, "服务地址已保存")}>
            保存
          </Btn>
        </div>
        <div className="form-row">
          <label>本地端口</label>
          <input type="number" value={settings.port} onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) || 0 })} />
          <Btn variant="secondary" onClick={() => save({ port: settings.port }, "端口已保存")}>
            保存
          </Btn>
        </div>
      </Card>

      <Card title="启动与常驻">
        <ToggleRow
          label="开机自动启动 Hub"
          checked={autostart === true}
          disabled={autostart === null}
          onChange={toggleAutostart}
        />
        <ToggleRow
          label="启动时自动拉起服务"
          checked={settings.autostartService}
          onChange={(v) => save({ autostartService: v }, "已保存")}
        />
        <ToggleRow
          label="退出 Hub 时停止服务"
          checked={settings.stopServiceOnExit}
          onChange={(v) => save({ stopServiceOnExit: v }, "已保存")}
        />
      </Card>

      <Card
        title="costrict-router 二进制"
        extra={
          <Btn variant="ghost" onClick={download}>
            重新下载 / 更新
          </Btn>
        }
      >
        {binary?.path ? (
          <>
            <div className="kv-list">
              <div className="kv">
                <span>版本</span>
                <code>{binary.version ?? "未知"}</code>
              </div>
              <div className="kv">
                <span>来源</span>
                <code>{binary.managed ? "Hub 托管目录" : "内置资源 / 外部"}</code>
              </div>
            </div>
            {binary.sha256 && <CopyRow label="SHA256" value={binary.sha256} />}
            {dlMsg && <p className="hint">{dlMsg}</p>}
          </>
        ) : (
          <>
            <Empty text="未安装二进制,点击右上角下载(GitHub Releases,自带 sha256 校验)" />
            {dlMsg && <p className="hint">{dlMsg}</p>}
          </>
        )}
      </Card>

      <Card title="目录">
        <div className="row-actions">
          <Btn variant="ghost" onClick={() => api.openAppPath("hub-data")}>
            Hub 数据目录
          </Btn>
          <Btn variant="ghost" onClick={() => api.openAppPath("router-log")}>
            router 日志
          </Btn>
          <Btn variant="ghost" onClick={() => api.openAppPath("router-config")}>
            router 配置
          </Btn>
        </div>
      </Card>

    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
      </div>
      <button
        className={`switch ${checked ? "on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }}
      >
        <span className="knob" />
      </button>
    </label>
  );
}
