import { useEffect, useRef } from "react";
import type { Preset } from "../types";

export function DeletePresetDialog({ preset, onClose, onDelete }: {
  preset: Preset | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (preset && !dialog.open) dialog.showModal();
    else if (!preset && dialog.open) dialog.close();
  }, [preset]);

  return (
    <dialog className="preset-dialog" ref={dialogRef} aria-labelledby="deleteDialogTitle" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="preset-dialog-card">
        <span className="step-label">Preset library</span><h2 id="deleteDialogTitle">Delete preset?</h2>
        <p>Delete “{preset?.name}” from your saved presets? This cannot be undone. Previously exported files will remain.</p>
        <div className="dialog-actions"><button className="button button-ghost" type="button" autoFocus onClick={onClose}>Cancel</button><button className="button button-danger" type="button" onClick={() => { if (preset) onDelete(preset.id); }}>Delete preset</button></div>
      </div>
    </dialog>
  );
}
