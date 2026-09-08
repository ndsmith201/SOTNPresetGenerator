import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { InstalledPreset } from "../types";

export function CreatePresetDialog({ open, installedPresets, loading, message, initialTemplate = "", onClose, onSubmit }: {
  open: boolean;
  installedPresets: InstalledPreset[];
  loading: boolean;
  message: string;
  initialTemplate?: string;
  onClose: () => void;
  onSubmit: (name: string, fileName: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [templateId, setTemplateId] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName("");
      setError("");
      setTemplateId(initialTemplate);
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) dialog.close();
  }, [open, initialTemplate]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name to continue.");
      inputRef.current?.focus();
      return;
    }
    if (templateId && !installedPresets.some((preset) => preset.fileName === templateId)) {
      setError("That template is no longer available. Choose another template.");
      return;
    }
    onSubmit(trimmed, templateId);
  };

  return (
    <dialog className="preset-dialog" ref={dialogRef} aria-labelledby="dialogTitle" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="preset-dialog-card" onSubmit={submit}>
        <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        <div className="dialog-icon"><Icon name="plus" /></div><span className="step-label">New preset</span><h2 id="dialogTitle">Name your preset</h2><p>Choose a starting template for your editable copy.</p>
        <label htmlFor="presetNameInput">Preset name</label>
        <input ref={inputRef} id="presetNameInput" type="text" maxLength={60} placeholder="e.g. Weekend challenge" autoComplete="off" value={name} className={error ? "is-invalid" : ""} onChange={(event) => { setName(event.target.value); setError(""); }} />
        <span className="field-error" aria-live="polite">{error}</span>
        <label htmlFor="presetTemplateInput">Starting template</label>
        <select id="presetTemplateInput" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Default preset-template</option>
          {installedPresets.length > 0 && <optgroup label="Installed presets (read-only)">
            {installedPresets.map((preset) => <option key={preset.fileName} value={preset.fileName}>{preset.name} — {preset.fileName}</option>)}
          </optgroup>}
        </select>
        <p className="template-help" role="status">{loading ? "Loading installed presets…" : message || "Missing built-in options are added to your copy. Installed files stay unchanged."}</p>
        <div className="dialog-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Continue <Icon name="arrow" /></button></div>
      </form>
    </dialog>
  );
}
