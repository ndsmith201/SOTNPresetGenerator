import { useEffect, useRef, useState } from "react";
import type { JsonObject } from "../types";
import { isJsonObject } from "../preset-utils";

export function ShareDialog({ name, kind, json, needsBuild, onClose, onShare }: {
  name: string; kind: "preset" | "option"; json: JsonObject; needsBuild: boolean;
  onClose: () => void; onShare: (description?: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const metadata = isJsonObject(json.metadata) ? json.metadata : {};
  const currentDescription = typeof metadata.description === "string" ? metadata.description : "";
  const [description, setDescription] = useState(currentDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewJson = kind === "preset" ? { ...json, metadata: { ...metadata, description: description.trim() } } : json;
  useEffect(() => { ref.current?.showModal(); }, []);
  const close = () => { if (!pending.current) onClose(); };
  return <dialog className="preset-dialog share-dialog" ref={ref} aria-labelledby="shareTitle" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="preset-dialog-card">
      <span className="step-label">Community</span><h2 id="shareTitle">Share {kind}?</h2>
      <p>Share “{name}” publicly with the community? Anyone can view and use this {kind}.</p>
      {kind === "preset" && <p>If a community preset has the same name and lists your username as an author, sharing updates that preset and keeps its votes.</p>}
      {kind === "preset" && <div className="dialog-field">
        <label htmlFor="sharePresetDescription">Description</label>
        <textarea ref={descriptionRef} id="sharePresetDescription" rows={3} maxLength={10000} required autoFocus disabled={busy}
          placeholder="Describe the route, difficulty, and special rules." value={description}
          onChange={event => { setDescription(event.target.value); setError(""); }} />
      </div>}
      {(needsBuild || (kind === "preset" && description.trim() !== currentDescription)) && <p>The preset will be exported and built before sharing.</p>}
      <details><summary>Review {kind} JSON</summary><pre className="community-json">{JSON.stringify(reviewJson, null, 2)}</pre></details>
      {error && <p className="community-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button button-ghost" autoFocus={kind === "option"} disabled={busy} onClick={close}>Cancel</button>
        <button className="button button-primary" disabled={busy} onClick={() => {
          if (pending.current) return;
          if (kind === "preset" && !description.trim()) {
            setError("Enter a description before sharing."); descriptionRef.current?.focus(); return;
          }
          pending.current = true; setBusy(true); setError("");
          void onShare(kind === "preset" ? description.trim() : undefined).catch(cause => setError(cause instanceof Error ? cause.message : "Unable to share.")).finally(() => { pending.current = false; setBusy(false); });
        }}>{busy ? "Sharing…" : "Share publicly"}</button>
      </div>
    </div>
  </dialog>;
}
