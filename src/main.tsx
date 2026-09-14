import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

function showFatal(prefix: string, detail: unknown) {
  const el = document.createElement("pre");
  const d = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ""}` : String(detail);
  el.textContent = `${prefix}: ${d}`;
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#fff;color:#900;padding:12px;font-size:11px;white-space:pre-wrap;max-height:60vh;overflow:auto";
  document.body.appendChild(el);
}

window.addEventListener("error", (e) => showFatal("window.error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showFatal("unhandledrejection", e.reason));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
