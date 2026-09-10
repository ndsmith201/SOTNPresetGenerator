import type { CatalogItem } from "../../community-types";
import { CommunityPresets } from "./CommunityPresets";
import type { InstalledPreset, Preset } from "../types";
import { formatUpdatedDate } from "../preset-utils";
import { Icon } from "./Icon";

interface PresetLibraryProps {
  presets: Preset[];
  onViewCommunity: (item: CatalogItem) => void;
  optionLabels: Map<string, string>;
  onCreate: () => void;
  onOpen: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  installedPresets: InstalledPreset[];
  installedConfigured: boolean;
  installedLoading: boolean;
  installedMessage: string;
  onViewInstalled: (preset: InstalledPreset) => void;
  onRefreshInstalled: () => void;
}

export function PresetLibrary({ onViewCommunity, presets, optionLabels, onCreate, onOpen, onDelete, installedPresets, installedConfigured, installedLoading, installedMessage, onViewInstalled, onRefreshInstalled }: PresetLibraryProps) {
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
      <CommunityPresets onOpen={onViewCommunity} />
      <CommunityPresets kind="options" onOpen={onViewCommunity} />
      {installedConfigured && <section className="installed-presets" aria-labelledby="installed-presets-title">
        <div className="library-heading">
          <div><span className="step-label">SOTNRando · Read-only</span><h2 id="installed-presets-title">Installed presets</h2><p>View installed JSON or use it as a template for a new preset.</p></div>
          <button className="button button-ghost" type="button" disabled={installedLoading} onClick={onRefreshInstalled}>Refresh</button>
        </div>
        <p className="installed-status" role="status">{installedLoading ? "Loading installed presets…" : installedMessage || `${installedPresets.length} installed presets`}</p>
        {!installedLoading && !installedMessage && installedPresets.length === 0 && <p className="installed-status">No JSON presets found in the configured presets folder.</p>}
        <div className="preset-grid">
          {installedPresets.map((preset) => <button className="preset-card" key={preset.fileName} type="button" aria-label={`View installed preset ${preset.name}`} onClick={() => onViewInstalled(preset)}>
            <span className="preset-card-top"><span className="preset-card-icon"><Icon name="file" /></span><span className="preset-option-count">Read-only</span></span>
            <strong className="preset-card-name">{preset.name}</strong>
            <span className="preset-summary">{preset.fileName}</span>
            <span className="preset-card-footer"><span>Installed preset</span><span className="preset-card-arrow">View <Icon name="arrow" /></span></span>
          </button>)}
        </div>
      </section>}
    </main>
  );
}
