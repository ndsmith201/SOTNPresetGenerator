import { useEffect, useState } from "react";

export function PresetNameInput({ name, onSave }: { name: string; onSave: (name: string) => string | void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      const saveError = onSave(trimmed);
      if (saveError) { setDraft(name); return; }
    }
    setDraft(trimmed || name);
  };
  return (
    <label className="preset-name-field">
      <span>Preset name</span>
      <input type="text" maxLength={60} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
    </label>
  );
}
