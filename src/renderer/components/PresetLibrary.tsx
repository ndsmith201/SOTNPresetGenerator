import type { Preset } from "../types";
import { formatUpdatedDate } from "../preset-utils";
import { Icon } from "./Icon";

interface PresetLibraryProps {
  presets: Preset[];
  optionLabels: Map<string, string>;
  onCreate: () => void;
  onOpen: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
}

export function PresetLibrary({ presets, optionLabels, onCreate, onOpen, onDelete }: PresetLibraryProps) {
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
              <div className="preset-card-container" key={preset.id}>
                <button className="preset-card" type="button" aria-label={`Edit ${preset.name}`} onClick={() => onOpen(preset)}>
                  <span className="preset-card-top"><span className="preset-card-icon"><Icon name="diamond" /></span><span className="preset-option-count">{labels.length} {labels.length === 1 ? "option" : "options"}</span></span>
                  <strong className="preset-card-name">{preset.name}</strong>
                  <span className="preset-summary">{labels.length ? labels.join(" · ") : "No options selected yet"}</span>
                  <span className="preset-card-footer"><span>{formatUpdatedDate(preset.updatedAt)}</span><span className="preset-card-arrow">Edit <Icon name="arrow" /></span></span>
                </button>
                <button className="preset-delete-button icon-button danger-text" type="button" aria-label={`Delete ${preset.name}`} title={`Delete ${preset.name}`} onClick={() => onDelete(preset)}><Icon name="trash" /></button>
              </div>
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
