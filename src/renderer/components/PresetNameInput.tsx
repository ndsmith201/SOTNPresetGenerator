import { useEffect, useState } from "react";

export function PresetNameInput({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const save = () => {
    const trimmed = draft.trim();
    setDraft(trimmed || name);
    if (trimmed && trimmed !== name) onSave(trimmed);
  };
  return (
    <label className="preset-name-field">
      <span>Preset name</span>
      <input type="text" maxLength={60} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
    </label>
  );
}
