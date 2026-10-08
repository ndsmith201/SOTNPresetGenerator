import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { InstalledPreset } from "../types";

export function CreatePresetDialog({ open, installedPresets, loading, message, initialTemplate = "", initialName = "", sourceName, onError, onClose, onSubmit }: {
  open: boolean;
  installedPresets: InstalledPreset[];
  loading: boolean;
  message: string;
  initialTemplate?: string;
  initialName?: string;
  sourceName?: string;
  onError: (message: string) => void;
  onClose: () => void;
  onSubmit: (name: string, fileName: string) => string | void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName(initialName);
      setTemplateId(initialTemplate);
      dialog.showModal();
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    } else if (!open && dialog.open) dialog.close();
  }, [open, initialTemplate, initialName]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      onError("Enter a name to continue.");
      inputRef.current?.focus();
      return;
    }
    if (!sourceName && templateId && !installedPresets.some((preset) => preset.fileName === templateId)) {
      onError("That template is no longer available. Choose another template.");
      return;
    }
    const submitError = onSubmit(trimmed, templateId);
    if (submitError) {
      onError(submitError);
      inputRef.current?.focus();
    }
  };

  return (
    <dialog className="preset-dialog" ref={dialogRef} aria-labelledby="dialogTitle" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="preset-dialog-card" onSubmit={submit}>
        <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        <div className="dialog-icon"><Icon name="plus" /></div><span className="step-label">New preset</span><h2 id="dialogTitle">Name your preset</h2><p>{sourceName ? `Choose a unique name for your copy of “${sourceName}”.` : "Choose a starting template for your editable copy."}</p>
        <label htmlFor="presetNameInput">Preset name</label>
        <input ref={inputRef} id="presetNameInput" type="text" maxLength={60} placeholder="e.g. Weekend challenge" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        {!sourceName && <><label htmlFor="presetTemplateInput">Starting template</label>
        <select id="presetTemplateInput" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Default preset-template</option>
          {installedPresets.length > 0 && <optgroup label="Installed presets (read-only)">
            {installedPresets.map((preset) => <option key={preset.fileName} value={preset.fileName}>{preset.name} — {preset.fileName}</option>)}
          </optgroup>}
        </select>
        <p className="template-help" role="status">{loading ? "Loading installed presets…" : message || "Missing built-in options are added to your copy. Installed files stay unchanged."}</p></>}
        <div className="dialog-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Continue <Icon name="arrow" /></button></div>
      </form>
    </dialog>
  );
}
