import { useState, type ReactNode } from "react";
import { copyText } from "../lib/bridge";

export function Card({ title, extra, children, className }: { title?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || extra) && (
        <header className="card-head">
          <h3>{title}</h3>
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "accent" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Btn({
  children,
  onClick,
  variant = "default",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "secondary" | "danger" | "danger-ghost" | "ghost";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
        {hint && <div className="toggle-hint">{hint}</div>}
      </div>
      <button
        className={`switch ${checked ? "on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        <span className="knob" />
      </button>
    </label>
  );
}

export function CopyRow({ label, value, mask = false }: { label: string; value: string; mask?: boolean }) {
  const [revealed, setRevealed] = useState(!mask);
  const [copied, setCopied] = useState(false);
  const display = mask && !revealed ? value.slice(0, 8) + "•".repeat(Math.max(value.length - 8, 4)) : value;
  return (
    <div className="copy-row">
      <span className="copy-label">{label}</span>
      <code className="copy-value" title={value}>
        {display}
      </code>
      <div className="copy-actions">
        {mask && (
          <button className="icon-btn" onClick={() => setRevealed((r) => !r)} title={revealed ? "隐藏" : "显示"}>
            {revealed ? "隐藏" : "显示"}
          </button>
        )}
        <button
          className="icon-btn"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }
          }}
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

export function CodeBlock({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{label}</span>
        <button
          className="icon-btn"
          onClick={async () => {
            if (await copyText(content)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }
          }}
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre>
        <code>{content}</code>
      </pre>
    </div>
  );
}

/** 确认弹层(应用内,不用浏览器 confirm) */
export function ConfirmBar({
  show,
  message,
  confirmText = "确认",
  onConfirm,
  onCancel,
}: {
  show: boolean;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!show) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <div className="confirm-actions">
          <Btn variant="ghost" onClick={onCancel}>
            取消
          </Btn>
          <Btn variant="danger" onClick={onConfirm}>
            {confirmText}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function fmtNum(n: number): string {
  return n.toLocaleString("zh-CN");
}
