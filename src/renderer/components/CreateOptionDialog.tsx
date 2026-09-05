import { useEffect, useRef, useState } from "react";
import { OPTION_GROUPS, WRITE_TYPES } from "../constants";
import type { CreateOptionInput, OptionCategory, WriteEntry, WriteType } from "../types";
import { isJsonObject } from "../preset-utils";
import { Icon } from "./Icon";

interface CreateOptionDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (option: CreateOptionInput) => Promise<void>;
}

export function CreateOptionDialog({ open, onClose, onSubmit }: CreateOptionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState<OptionCategory>("world");
  const [type, setType] = useState<WriteType>("word");
  const [value, setValue] = useState("");
  const [address, setAddress] = useState("");
  const [gameInit, setGameInit] = useState(false);
  const [rawJson, setRawJson] = useState(false);
  const [additionalSource, setAdditionalSource] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setComment(""); setCategory("world"); setType("word"); setValue(""); setAddress(""); setGameInit(false); setRawJson(false); setAdditionalSource(""); setError("");
      dialog.showModal();
      requestAnimationFrame(() => commentRef.current?.focus());
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  const parseAdditionalWrites = (): WriteEntry[] => {
    if (!additionalSource.trim()) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(additionalSource) as unknown; }
    catch { throw new Error("Additional writes must contain valid JSON."); }
    if (!Array.isArray(parsed) || !parsed.every(isJsonObject)) throw new Error("Additional writes must be a JSON array of objects.");
    return parsed;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim() || !value.trim()) { setError("Enter both a comment and value."); return; }
    setSubmitting(true); setError("");
    try {
      if (rawJson) {
        let parsed: unknown;
        try { parsed = JSON.parse(value) as unknown; }
        catch { throw new Error("Raw JSON must contain valid JSON."); }
        if (!isJsonObject(parsed)) throw new Error("Raw JSON must be a JSON object.");
      }
      const additionalWrites = rawJson ? [] : parseAdditionalWrites();
      await onSubmit({ comment: comment.trim(), category, type, value: value.trim(), ...(rawJson ? { rawJson: true } : {}), ...(!rawJson && address.trim() ? { address: address.trim() } : {}), ...(!rawJson && gameInit ? { gameInit: true } : {}), ...(additionalWrites.length ? { additionalWrites } : {}) });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add the option.");
    } finally { setSubmitting(false); }
  };

  return (
    <dialog className="preset-dialog option-dialog" ref={dialogRef} aria-labelledby="optionDialogTitle" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="preset-dialog-card" onSubmit={(event) => void submit(event)}>
        <button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        <div className="dialog-icon"><Icon name="plus" /></div><span className="step-label">New option</span><h2 id="optionDialogTitle">Add a preset option</h2><p>Write options target the writes array. Raw JSON options merge their object directly into the preview.</p>
        <div className="dialog-field"><label htmlFor="optionCommentInput">Comment</label><input ref={commentRef} id="optionCommentInput" type="text" maxLength={120} placeholder="e.g. Enable Soul of Bat" autoComplete="off" value={comment} onChange={(event) => { setComment(event.target.value); setError(""); }} /></div>
        <div className="dialog-field-row">
          <div className="dialog-field"><label htmlFor="optionCategorySelect">Category</label><select id="optionCategorySelect" value={category} onChange={(event) => setCategory(event.target.value as OptionCategory)}>{OPTION_GROUPS.map((group) => <option value={group.id} key={group.id}>{group.label}</option>)}</select></div>
          <div className="dialog-field"><label htmlFor="optionTypeSelect">Type</label><select id="optionTypeSelect" value={type} disabled={rawJson} onChange={(event) => setType(event.target.value as WriteType)}>{WRITE_TYPES.map((writeType) => <option value={writeType} key={writeType}>{writeType}</option>)}</select></div>
        </div>
        <label className="option-mode-toggle" htmlFor="optionRawJsonInput"><input id="optionRawJsonInput" type="checkbox" checked={rawJson} onChange={(event) => { setRawJson(event.target.checked); setError(""); }} /><span><strong>Raw JSON</strong><small>Merge an object into the top level of the preview instead of adding a write.</small></span></label>
        <div className="dialog-field"><label htmlFor="optionValueInput">{rawJson ? "Raw preview JSON" : "Value"}</label>{rawJson ? <textarea id="optionValueInput" rows={5} maxLength={10000} placeholder={'{"enemyDrops": true}'} spellCheck={false} value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} /> : <input id="optionValueInput" type="text" maxLength={500} placeholder="e.g. 0xa0627964" autoComplete="off" spellCheck={false} value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} />}</div>
        {!rawJson && <><div className="dialog-field"><label htmlFor="optionAddressInput">Address <span className="optional-label">Optional</span></label><input id="optionAddressInput" type="text" maxLength={32} placeholder="e.g. 0x00123456" autoComplete="off" spellCheck={false} value={address} onChange={(event) => { setAddress(event.target.value); setError(""); }} /></div>
        <label className="option-mode-toggle" htmlFor="optionGameInitInput"><input id="optionGameInitInput" type="checkbox" checked={gameInit} onChange={(event) => setGameInit(event.target.checked)} /><span><strong>Game init</strong><small>Place this option&apos;s writes after “lui v1, 0x8004”.</small></span></label>
        <div className="dialog-field"><label htmlFor="optionAdditionalWritesInput">Additional writes <span className="optional-label">Optional JSON array</span></label><textarea id="optionAdditionalWritesInput" rows={4} placeholder='[{"type":"word","value":"0x00000000","comment":"Follow-up write"}]' spellCheck={false} value={additionalSource} onChange={(event) => { setAdditionalSource(event.target.value); setError(""); }} /></div></>}
        <span className="field-error" aria-live="polite">{error}</span>
        <div className="dialog-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add option"}</button></div>
      </form>
    </dialog>
  );
}
