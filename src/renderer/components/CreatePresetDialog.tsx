import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function CreatePresetDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (name: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setName("");
      setError("");
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name to continue.");
      inputRef.current?.focus();
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <dialog className="preset-dialog" ref={dialogRef} aria-labelledby="dialogTitle" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="preset-dialog-card" onSubmit={submit}>
        <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        <div className="dialog-icon"><Icon name="plus" /></div><span className="step-label">New preset</span><h2 id="dialogTitle">Name your preset</h2><p>Give it a memorable name. You can start selecting options next.</p>
        <label htmlFor="presetNameInput">Preset name</label>
        <input ref={inputRef} id="presetNameInput" type="text" maxLength={60} placeholder="e.g. Weekend challenge" autoComplete="off" value={name} className={error ? "is-invalid" : ""} onChange={(event) => { setName(event.target.value); setError(""); }} />
        <span className="field-error" aria-live="polite">{error}</span>
        <div className="dialog-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Continue <Icon name="arrow" /></button></div>
      </form>
    </dialog>
  );
}
