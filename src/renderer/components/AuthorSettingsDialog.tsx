import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function AuthorSettingsDialog({ open, author, onClose, onSave }: {
  open: boolean;
  author: string;
  onClose: () => void;
  onSave: (author: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(author);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(author);
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open, author]);

  return (
    <dialog className="preset-dialog" ref={dialogRef} aria-labelledby="authorDialogTitle" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form className="preset-dialog-card" onSubmit={(event) => { event.preventDefault(); onSave(value.trim()); }}>
        <button className="dialog-close" type="button" aria-label="Close author settings" onClick={onClose}><Icon name="close" /></button>
        <span className="step-label">Settings</span><h2 id="authorDialogTitle">Preset author</h2>
        <p>Used for all generated presets, including existing ones. Leave blank to use the template author.</p>
        <label htmlFor="presetAuthorInput">Author name</label>
        <input id="presetAuthorInput" autoFocus type="text" maxLength={100} placeholder="Your name" value={value} onChange={(event) => setValue(event.target.value)} />
        <div className="dialog-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">Save author</button></div>
      </form>
    </dialog>
  );
}
