import { useEffect, useRef, useState } from "react";
import { parseWriteImport } from "../option-authoring";
import type { WriteEntry } from "../types";
import { Icon } from "./Icon";

export function ImportWritesDialog({ onClose, onImport }: {
  onClose: () => void;
  onImport: (writes: WriteEntry[]) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    inputRef.current?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog className="preset-dialog import-writes-dialog" ref={dialogRef} aria-labelledby="importWritesTitle" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
      <form className="preset-dialog-card" onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        try { onImport(parseWriteImport(source)); }
        catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to import writes."); inputRef.current?.focus(); }
      }}>
        <button className="dialog-close" type="button" aria-label="Close import dialog" onClick={onClose}><Icon name="close" /></button>
        <span className="step-label">Memory patch</span>
        <h2 id="importWritesTitle">Import writes</h2>
        <p id="importWritesHelp">Paste a JSON array or comma-separated write objects. Importing replaces the current write rows in the same order.</p>
        <label htmlFor="importWritesInput">Writes JSON</label>
        <textarea ref={inputRef} id="importWritesInput" autoFocus rows={12} spellCheck={false} aria-describedby="importWritesHelp importWritesError" aria-invalid={Boolean(error)} value={source} placeholder={'[\n  { "type": "word", "address": "0xB57B8", "value": "0x800DFFE0" },\n  { "type": "word", "value": "0x800E02B0" }\n]'} onChange={event => { setSource(event.target.value); setError(""); }} />
        <span id="importWritesError" className="field-error" role="alert">{error}</span>
        <div className="dialog-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={!source.trim()}>Import writes</button>
        </div>
      </form>
    </dialog>
  );
}
