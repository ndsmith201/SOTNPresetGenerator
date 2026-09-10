import { useEffect, useRef, useState } from "react";
import type { JsonObject } from "../types";

export function ShareDialog({ name, kind, json, needsBuild, onClose, onShare }: {
  name: string; kind: "preset" | "option"; json: JsonObject; needsBuild: boolean;
  onClose: () => void; onShare: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  const close = () => { if (!pending.current) onClose(); };
  return <dialog className="preset-dialog share-dialog" ref={ref} aria-labelledby="shareTitle" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="preset-dialog-card">
      <span className="step-label">Community</span><h2 id="shareTitle">Share {kind}?</h2>
      <p>Share “{name}” publicly with the community? Anyone can view and use this {kind}.</p>
      {kind === "preset" && <p>If a community preset has the same name and lists your username as an author, sharing updates that preset and keeps its votes.</p>}
      {needsBuild && <p>The preset will be exported and built before sharing.</p>}
      <details><summary>Review {kind} JSON</summary><pre className="community-json">{JSON.stringify(json, null, 2)}</pre></details>
      {error && <p className="community-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button button-ghost" autoFocus disabled={busy} onClick={close}>Cancel</button>
        <button className="button button-primary" disabled={busy} onClick={() => {
          if (pending.current) return;
          pending.current = true; setBusy(true); setError("");
          void onShare().catch(cause => setError(cause instanceof Error ? cause.message : "Unable to share.")).finally(() => { pending.current = false; setBusy(false); });
        }}>{busy ? "Sharing…" : "Share publicly"}</button>
      </div>
    </div>
  </dialog>;
}
