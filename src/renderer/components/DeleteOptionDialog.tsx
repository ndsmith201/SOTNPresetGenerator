import { useEffect, useRef, useState } from "react";
import type { PresetOption } from "../types";

export function DeleteOptionDialog({ option, onClose, onDelete }: { option: PresetOption; onClose: () => void; onDelete: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  const close = () => { if (!pending.current) onClose(); };
  return <dialog ref={ref} className="preset-dialog" aria-labelledby="deleteOptionTitle" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="preset-dialog-card"><span className="step-label">Your options</span><h2 id="deleteOptionTitle">Delete option?</h2>
      <p>Delete “{option.label}” from your option catalog and remove it from your saved presets? This cannot be undone. Shared community copies and exported files will remain.</p>
      {error && <p className="community-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button button-ghost" autoFocus disabled={busy} onClick={close}>Cancel</button><button className="button button-danger" disabled={busy} onClick={() => {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError("");
        void onDelete().catch(cause => setError(cause instanceof Error ? cause.message : "Unable to delete option.")).finally(() => { pending.current = false; setBusy(false); });
      }}>{busy ? "Deleting…" : "Delete option"}</button></div>
    </div>
  </dialog>;
}
