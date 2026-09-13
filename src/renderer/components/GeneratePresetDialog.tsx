import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function GeneratePresetDialog({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (seedName: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [seedName, setSeedName] = useState("");

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return (
    <dialog className="preset-dialog" ref={dialogRef} aria-labelledby="generateDialogTitle" onCancel={event => { event.preventDefault(); onClose(); }}>
      <form className="preset-dialog-card" onSubmit={event => { event.preventDefault(); onSubmit(seedName.trim()); }}>
        <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        <div className="dialog-icon"><Icon name="spark" /></div>
        <span className="step-label">Generate patch</span>
        <h2 id="generateDialogTitle">Choose a seed name</h2>
        <p>Enter a seed name or leave it blank to generate one automatically.</p>
        <label htmlFor="seedNameInput">Seed name <span className="optional-label">Optional</span></label>
        <input id="seedNameInput" type="text" autoFocus autoComplete="off" placeholder="e.g. Weekend challenge" value={seedName} onChange={event => setSeedName(event.target.value)} />
        <div className="dialog-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit">Generate</button>
        </div>
      </form>
    </dialog>
  );
}
