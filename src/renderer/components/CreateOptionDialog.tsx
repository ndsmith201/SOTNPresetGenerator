import { useEffect, useRef, useState } from "react";
import { OPTION_GROUPS, WRITE_TYPES } from "../constants";
import type { CreateOptionInput, DatabaseOption } from "../types";
import { draftInput, normalizeWrites, optionDraft, parseWriteSource, type OptionDraft, type WritePlacement } from "../option-authoring";
import { Icon } from "./Icon";

interface CreateOptionDialogProps {
  open: boolean;
  option: DatabaseOption | null;
  options: DatabaseOption[];
  /** Embed the shared editor as a read-only page instead of a modal. */
  inline?: boolean;
  onClose: () => void;
  onSubmit?: (option: CreateOptionInput, enableInPreset: boolean) => Promise<void>;
}

const placementLabels: Record<WritePlacement, string> = {
  default: "Default placement", "game-init": "Game initialization", "after-relics": "After relic writes"
};
const starts = [
  { id: "copy", icon: "copy", title: "Copy an existing option", help: "Use a working option as your starting point." },
  { id: "write", icon: "cpu", title: "Memory patch", help: "Create one or more custom writes." },
  { id: "json", icon: "code", title: "JSON settings", help: "Merge settings into the preset." }
] as const;

export function CreateOptionDialog({ open, option, options, inline = false, onClose, onSubmit }: CreateOptionDialogProps) {
  const readOnly = inline || (option?.readOnly ?? false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"start" | "editor">(option ? "editor" : "start");
  const [start, setStart] = useState<"copy" | "write" | "json">("copy");
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [copiedFrom, setCopiedFrom] = useState("");
  const [draft, setDraft] = useState<OptionDraft>(() => optionDraft(option));
  const [enableInPreset, setEnableInPreset] = useState(false);
  const [advancedSource, setAdvancedSource] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rowAnnouncement, setRowAnnouncement] = useState("");
  const submittingRef = useRef(false);
  const dragIndex = useRef<number | null>(null);
  const editorOrigin = useRef("");

  useEffect(() => {
    if (inline) { setDraft(optionDraft(option)); setStep("editor"); return; }
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraft(optionDraft(option)); setStep(option ? "editor" : "start");
      setStart("copy"); setQuery(""); setSourceId(null); setCopiedFrom("");
      setEnableInPreset(false); setAdvancedSource(null); setError(""); setRowAnnouncement(""); editorOrigin.current = "";
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open, option, inline]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => (step === "editor" ? nameRef.current : headingRef.current)?.focus());
  }, [open, step]);

  const change = (changes: Partial<OptionDraft>) => { if (readOnly) return; setDraft(current => ({ ...current, ...changes })); setError(""); };
  const close = () => { if (!submittingRef.current) onClose(); };
  const source = options.find(item => item.id === sourceId);
  const results = options.filter(item => `${item.comment} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const categoryLabel = OPTION_GROUPS.find(group => group.id === draft.category)?.label;
  let input: CreateOptionInput | null = null;
  let validation = "";
  try { input = draftInput(draft); } catch (issue) { validation = issue instanceof Error ? issue.message : "Check your option fields."; }
  const preview = input ? (input.rawJson ? JSON.parse(input.value!) : { writes: input.writes }) : null;

  const continueToEditor = () => {
    if (start === "copy" && !source) return;
    const origin = start === "copy" ? `copy:${sourceId}` : start;
    if (editorOrigin.current !== origin) {
      const next = optionDraft(start === "copy" ? source : null);
      if (start === "copy" && source) { next.comment = `${source.comment} (copy)`.slice(0, 120); setCopiedFrom(source.comment); }
      else { next.rawJson = start === "json"; setCopiedFrom(""); }
      setDraft(next); setAdvancedSource(null); editorOrigin.current = origin;
    }
    setError(""); setStep("editor");
  };
  const editWrite = (index: number, key: string, value: string) => {
    change({ writes: draft.writes.map((write, i) => i === index ? { ...write, [key]: value } : write) });
  };
  const moveWrite = (from: number, to: number) => {
    if (from === to || to < 0 || to >= draft.writes.length || readOnly || submitting) return;
    const writes = [...draft.writes];
    const [moved] = writes.splice(from, 1); writes.splice(to, 0, moved);
    change({ writes }); setRowAnnouncement(`Write ${from + 1} moved to position ${to + 1}.`);
    requestAnimationFrame(() => dialogRef.current?.querySelectorAll<HTMLElement>(".builder-write-row")[to]?.focus());
  };
  const applyJson = () => {
    try { change({ writes: normalizeWrites(parseWriteSource(advancedSource ?? "")) }); setAdvancedSource(null); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Enter valid write JSON."); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || readOnly || !onSubmit) return;
    if (step === "start") { continueToEditor(); return; }
    if (advancedSource !== null) { setError("Apply or discard the JSON edits before saving."); return; }
    if (!input) {
      setError(validation);
      const row = validation.match(/^Write (\d+):/);
      const selector = row ? `[aria-label="Write ${row[1]} ${validation.includes("address") ? "address (optional)" : validation.includes("type") ? "type" : "value"}"]` : draft.rawJson && draft.comment.trim() ? "#optionJsonInput" : "#optionCommentInput";
      dialogRef.current?.querySelector<HTMLElement>(selector)?.focus();
      return;
    }
    submittingRef.current = true; setSubmitting(true); setError("");
    try { await onSubmit(input, !option && enableInPreset); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to save this option."); }
    finally { submittingRef.current = false; setSubmitting(false); }
  };

  const form = <form className={`preset-dialog-card${readOnly ? " is-read-only" : ""}`} onSubmit={event => void submit(event)}>
      <header className="builder-header">
        <button className="dialog-close" type="button" aria-label="Close dialog" disabled={submitting} onClick={close}><Icon name="close" /></button>
        <span className="step-label">{readOnly ? "Read-only option" : option ? "Edit option" : "New option"}</span>
        <h2 id="optionDialogTitle" ref={headingRef} tabIndex={-1}>{step === "start" ? "How would you like to start?" : readOnly ? "View preset option" : option ? "Edit preset option" : copiedFrom ? "Make it your own" : "Create your option"}</h2>
        <p>{step === "start" ? "Create a reusable option for your local presets." : readOnly ? "This option is read-only. Its values can be selected and copied." : copiedFrom ? `Copied from ${copiedFrom}` : option ? "Changes apply to all local presets that use this option." : "Name your option, add its settings, and check the preview."}</p>
      </header>
      <div className="builder-scroll">
        {step === "start" ? <div className="builder-start">
          <div className="builder-paths" role="group" aria-label="Starting point">
            {starts.map(path => <button key={path.id} type="button" className={`builder-path${start === path.id ? " is-selected" : ""}`} aria-pressed={start === path.id} onClick={() => setStart(path.id)}>
              <Icon name={path.icon} /><strong>{path.title}</strong>{path.id === "copy" && <span className="builder-recommended">Recommended</span>}<span>{path.help}</span>
            </button>)}
          </div>
          {start === "copy" ? <section className="builder-copy-list" aria-labelledby="copyOptionTitle">
            <h3 id="copyOptionTitle">Choose an option to copy</h3>
            <label className="search-box"><Icon name="search" /><input type="search" aria-label="Search options to copy" placeholder="Search by name or description…" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="builder-results" role="radiogroup" aria-label="Options to copy">
              {results.map(item => <label key={item.id} className={`builder-copy-result${sourceId === item.id ? " is-selected" : ""}`}>
                <input type="radio" name="sourceOption" checked={sourceId === item.id} onChange={() => setSourceId(item.id)} />
                <span><strong>{item.comment}</strong><small>{item.description || "Reusable preset option"}</small></span>
                <span className="builder-badge">{OPTION_GROUPS.find(group => group.id === item.category)?.label}</span>
                <span className="builder-badge">{item.rawJson ? "JSON settings" : `${item.writes.length} writes`}</span>
              </label>)}
              {!results.length && <p className="builder-empty">{options.length ? "No matching options. Try another search." : "No options to copy yet. Start with a memory patch or JSON settings."}</p>}
            </div>
            <p className="builder-help">Your copy is editable. The original stays unchanged.</p>
          </section> : <p className="builder-help builder-path-help">{start === "write" ? "Add write values and optional addresses in a row editor. You can also paste an existing write sequence as JSON." : "Enter a JSON object. Matching top-level settings are replaced, rather than merged recursively."}</p>}
        </div> : <div className="builder-columns">
          <div className="builder-editor">
            <fieldset className="builder-fields" disabled={submitting}>
              <div className="dialog-field"><label htmlFor="optionCommentInput">Option name</label><input ref={nameRef} id="optionCommentInput" readOnly={readOnly} maxLength={120} placeholder="e.g. My stat boost" autoComplete="off" value={draft.comment} onChange={event => change({ comment: event.target.value })} /></div>
              <div className="dialog-field-row">
                <div className="dialog-field"><label htmlFor="optionCategorySelect">Category</label><select id="optionCategorySelect" disabled={readOnly} value={draft.category} onChange={event => change({ category: event.target.value as OptionDraft["category"] })}>{OPTION_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></div>
                <div className="dialog-field"><label htmlFor="optionModeSelect">Mode</label><div className="builder-mode-select"><Icon name={draft.rawJson ? "code" : "cpu"} /><select id="optionModeSelect" disabled={readOnly || advancedSource !== null} value={draft.rawJson ? "json" : "write"} onChange={event => change({ rawJson: event.target.value === "json" })}><option value="write">Memory patch</option><option value="json">JSON settings</option></select></div></div>
              </div>
              <div className="dialog-field"><label htmlFor="optionDescriptionInput">Description <span className="optional-label">Optional</span></label><textarea id="optionDescriptionInput" readOnly={readOnly} rows={2} maxLength={10000} placeholder="Describe what this option does in game." value={draft.description} onChange={event => change({ description: event.target.value })} /></div>
              {draft.rawJson ? <div className="dialog-field builder-json-settings"><label htmlFor="optionJsonInput">JSON settings</label><p className="builder-help">Merge an object into the preset. Matching top-level values are replaced; nested objects are not merged recursively. Preset metadata and location filtering still apply.</p><textarea id="optionJsonInput" readOnly={readOnly} rows={12} maxLength={10000} spellCheck={false} value={draft.json} onChange={event => change({ json: event.target.value })} /></div> : <>
                <div className="builder-section-heading"><h3>Writes</h3><span className="builder-badge">{draft.writes.length} {draft.writes.length === 1 ? "write" : "writes"}</span></div>
                <p className="builder-help">Writes run in the order shown. Each address is optional.</p>
                <div className="builder-write-list" aria-label="Write sequence">
                  {draft.writes.map((write, index) => <div className="builder-write-row" key={index} tabIndex={-1} role="group" aria-label={`Write ${index + 1}`} onDragOver={event => { if (!readOnly && advancedSource === null) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragIndex.current !== null && advancedSource === null) moveWrite(dragIndex.current, index); dragIndex.current = null; }}>
                    <div className="builder-write-order"><span className="builder-grip" draggable={!readOnly && !submitting && advancedSource === null} title={readOnly ? `Write ${index + 1}` : "Drag to reorder"} onDragStart={event => { dragIndex.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }} onDragEnd={() => { dragIndex.current = null; }}>{index + 1}</span>
                      {!readOnly && <span className="builder-move-buttons"><button type="button" aria-label={`Move write ${index + 1} up`} disabled={index === 0 || advancedSource !== null} onClick={() => moveWrite(index, index - 1)}>↑</button><button type="button" aria-label={`Move write ${index + 1} down`} disabled={index === draft.writes.length - 1 || advancedSource !== null} onClick={() => moveWrite(index, index + 1)}>↓</button></span>}
                    </div>
                    <label className="builder-write-type">Type<select aria-label={`Write ${index + 1} type`} disabled={readOnly || advancedSource !== null} value={String(write.type ?? "")} onChange={event => editWrite(index, "type", event.target.value)}>{!WRITE_TYPES.includes(write.type as typeof WRITE_TYPES[number]) && <option value={String(write.type ?? "")}>{String(write.type ?? "Choose type")}</option>}{WRITE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
                    <label className="builder-write-value">Value<input aria-label={`Write ${index + 1} value`} readOnly={readOnly || advancedSource !== null} spellCheck={false} placeholder="0x00000000" value={String(write.value ?? "")} onChange={event => editWrite(index, "value", event.target.value)} /></label>
                    <label className="builder-write-address">Address <span className="optional-label">Optional</span><input aria-label={`Write ${index + 1} address (optional)`} readOnly={readOnly || advancedSource !== null} spellCheck={false} placeholder="0x…" value={typeof write.address === "number" ? `0x${write.address.toString(16)}` : String(write.address ?? "")} onChange={event => editWrite(index, "address", event.target.value)} /></label>
                    <label className="builder-write-note">Note <span className="optional-label">Optional</span><input aria-label={`Write ${index + 1} note (optional)`} readOnly={readOnly || advancedSource !== null} placeholder="Describe this write" value={String(write.comment ?? "")} onChange={event => editWrite(index, "comment", event.target.value)} /></label>
                    {!readOnly && <button className="builder-remove" type="button" aria-label={`Delete write ${index + 1}`} disabled={draft.writes.length === 1 || advancedSource !== null} onClick={() => { change({ writes: draft.writes.filter((_, i) => i !== index) }); setRowAnnouncement(`Write ${index + 1} deleted.`); }}><Icon name="trash" /></button>}
                  </div>)}
                </div>
                {!readOnly && <button className="button button-ghost builder-add-write" type="button" disabled={advancedSource !== null} onClick={() => { change({ writes: [...draft.writes, { type: "word", value: "" }] }); setRowAnnouncement(`Write ${draft.writes.length + 1} added.`); }}>+ Add write</button>}
                <div className="dialog-field builder-placement"><label htmlFor="optionPlacementSelect">Write placement</label><select id="optionPlacementSelect" disabled={readOnly} value={draft.placement} onChange={event => change({ placement: event.target.value as WritePlacement })}>{Object.entries(placementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="builder-help">{draft.placement === "game-init" ? "Insert after the template’s “lui v1, 0x8004” initialization anchor." : draft.placement === "after-relics" ? "Place injected writes after relic-option writes. Use this order for starting-stat changes." : "Use the template’s normal assembly rules for this category and its addresses."}</p></div>
                <details className="builder-advanced"><summary>Advanced JSON</summary><p className="builder-help">Edit the complete write sequence. Extra properties are preserved when editing rows.</p><textarea aria-label="Complete write sequence JSON" readOnly={readOnly} rows={8} spellCheck={false} value={advancedSource ?? JSON.stringify(draft.writes, null, 2)} onChange={event => setAdvancedSource(event.target.value)} />{advancedSource !== null && <div className="dialog-actions"><button type="button" className="button button-ghost" onClick={() => { setAdvancedSource(null); setError(""); }}>Discard JSON edits</button><button type="button" className="button button-primary" onClick={applyJson}>Apply JSON</button></div>}</details>
              </>}
            </fieldset>
          </div>
          <aside className="builder-preview" aria-label="Option preview">
            <h3>Option preview</h3><div className="builder-preview-card"><span>{categoryLabel}</span><strong>{draft.comment.trim() || "Your option name"}</strong><p>{draft.description.trim() || "Your description will appear here."}</p></div>
            <h3>What this adds</h3><ul><li>{draft.rawJson ? "JSON settings" : `${draft.writes.length} memory ${draft.writes.length === 1 ? "write" : "writes"}`}</li>{!draft.rawJson && <li>{placementLabels[draft.placement]}</li>}<li>{inline ? "Add to your options to use in local presets" : "Available to all local presets"}</li></ul>
            <details className="builder-generated"><summary>View generated JSON</summary><p className="builder-help">{draft.rawJson ? "Settings merged into the preset." : "This option’s writes, before template assembly."}</p><pre>{preview ? JSON.stringify(preview, null, 2) : "Complete the fields to preview this option."}</pre></details>
            <p className={`builder-validation${input && advancedSource === null ? " is-valid" : ""}`} aria-live="polite">{advancedSource !== null ? "Apply or discard your JSON edits." : validation || (draft.rawJson ? "JSON format looks valid" : "Write format looks valid")}</p>
            <p className="builder-help">Game behavior still needs testing.</p>
          </aside>
        </div>}
      </div>
      <footer className="builder-footer">
        <div className="builder-footer-status">{step === "editor" && !option ? <label className="builder-enable"><input type="checkbox" checked={enableInPreset} disabled={submitting} onChange={event => setEnableInPreset(event.target.checked)} />Also enable in this preset</label> : step === "start" ? <span>Will be saved to your local option library</span> : null}<span className="field-error" role="alert">{error}</span></div>
        <div className="dialog-actions"><button className="button button-ghost" type="button" disabled={submitting} onClick={() => { if (step === "editor" && !option) { setStep("start"); setError(""); } else close(); }}>{step === "editor" && !option ? "Back" : readOnly ? "Close" : "Cancel"}</button>{!readOnly && <button className="button button-primary" type="submit" disabled={submitting || (step === "start" && start === "copy" && !source) || (step === "editor" && advancedSource !== null)}>{submitting ? "Saving…" : step === "start" ? "Continue →" : option ? "Save changes" : "Create option"}</button>}</div>
      </footer>
      <span className="builder-sr-only" aria-live="polite">{rowAnnouncement}</span>
    </form>;

  return inline ? <section className="option-dialog option-builder option-builder-inline" aria-labelledby="optionDialogTitle">{form}</section> :
    <dialog className="preset-dialog option-dialog option-builder" ref={dialogRef} aria-labelledby="optionDialogTitle"
      onCancel={event => { event.preventDefault(); close(); }}>{form}</dialog>;
}
