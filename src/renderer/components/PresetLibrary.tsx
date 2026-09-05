import type { Preset } from "../types";
import { formatUpdatedDate } from "../preset-utils";
import { Icon } from "./Icon";

interface PresetLibraryProps {
  presets: Preset[];
  optionLabels: Map<string, string>;
  onCreate: () => void;
  onOpen: (preset: Preset) => void;
}

export function PresetLibrary({ presets, optionLabels, onCreate, onOpen }: PresetLibraryProps) {
  const ordered = [...presets].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return (
    <main className="preset-library">
      <div className="library-heading">
        <div><span className="step-label">Preset library</span><h2>Your presets</h2><p>Create a configuration or continue working on an existing one.</p></div>
        <button className="icon-button create-icon-button" type="button" aria-label="Create a new preset" title="Create a new preset" onClick={onCreate}><Icon name="plus" /></button>
      </div>
      {ordered.length ? (
        <div className="preset-grid">
          {ordered.map((preset) => {
            const labels = preset.optionIds.map((id) => optionLabels.get(id)).filter((label): label is string => Boolean(label));
            return (
              <button className="preset-card" type="button" key={preset.id} aria-label={`Edit ${preset.name}`} onClick={() => onOpen(preset)}>
                <span className="preset-card-top"><span className="preset-card-icon"><Icon name="diamond" /></span><span className="preset-option-count">{labels.length} {labels.length === 1 ? "option" : "options"}</span></span>
                <strong className="preset-card-name">{preset.name}</strong>
                <span className="preset-summary">{labels.length ? labels.join(" · ") : "No options selected yet"}</span>
                <span className="preset-card-footer"><span>{formatUpdatedDate(preset.updatedAt)}</span><span className="preset-card-arrow">Edit <Icon name="arrow" /></span></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="library-empty">
          <div className="empty-preset-icon"><Icon name="file" /></div>
          <strong>No presets yet</strong><span>Create your first preset to start choosing options.</span>
          <button className="button button-primary" type="button" onClick={onCreate}>Create a preset</button>
        </div>
      )}
    </main>
  );
}
