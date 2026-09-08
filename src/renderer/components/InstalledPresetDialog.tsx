import { useEffect, useRef } from "react";
import type { InstalledPreset } from "../types";
import { syntaxHighlight } from "../preset-utils";
import { Icon } from "./Icon";

export function InstalledPresetDialog({ preset, onClose, onCreate, onCopy }: {
  preset: InstalledPreset | null;
  onClose: () => void;
  onCreate: (preset: InstalledPreset) => void;
  onCopy: (preset: InstalledPreset) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (preset && dialog && !dialog.open) dialog.showModal();
    else if (!preset && dialog?.open) dialog.close();
  }, [preset]);
  return <dialog className="preset-dialog installed-preset-dialog" ref={dialogRef} aria-labelledby="installed-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {preset && <div className="preset-dialog-card">
      <button className="dialog-close" type="button" aria-label="Close installed preset" onClick={onClose}><Icon name="close" /></button>
      <span className="step-label">Installed preset · Read-only</span>
      <h2 id="installed-dialog-title">{preset.name}</h2>
      <p>{preset.fileName}. Create a new preset to edit a copy.</p>
      <pre className="code-preview installed-json" aria-label="Installed preset JSON" dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(preset.json, null, 2)) }} />
      <div className="dialog-actions">
        <button className="button button-ghost" type="button" onClick={() => onCopy(preset)}>Copy JSON</button>
        <button className="button button-primary" type="button" onClick={() => onCreate(preset)}>Use as template</button>
      </div>
    </div>}
  </dialog>;
}
