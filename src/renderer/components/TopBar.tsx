import { Icon } from "./Icon";

interface TopBarProps {
  editing: boolean;
  presetCount: number;
  exporting: boolean;
  onNewPreset: () => void;
  onBack: () => void;
  onReset: () => void;
  onExport: () => void;
  onSave: () => void;
}

export function TopBar(props: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 3.5 27 9.8v12.4L16 28.5 5 22.2V9.8L16 3.5Z" /><path d="m10.5 15.8 3.4 3.5 7.8-8" /></svg></div>
        <div className="brand-copy"><span className="eyebrow">Randomizer tools</span><h1>SOTN Preset Generator</h1></div>
      </div>
      {!props.editing ? (
        <div className="topbar-actions">
          <span className="preset-total"><strong>{props.presetCount}</strong> presets</span>
          <button className="button button-primary" type="button" onClick={props.onNewPreset}><Icon name="plus" />New preset</button>
        </div>
      ) : (
        <div className="topbar-actions">
          <button className="button button-ghost button-with-icon" type="button" onClick={props.onBack}><Icon name="back" />Presets</button>
          <span className="draft-status"><span /> Local draft</span>
          <button className="button button-ghost" type="button" onClick={props.onReset}>Reset</button>
          <button className="button button-ghost button-with-icon" type="button" disabled={props.exporting} onClick={props.onExport}><Icon name="download" />{props.exporting ? "Building…" : "Export"}</button>
          <button className="button button-primary" type="button" onClick={props.onSave}>Save preset</button>
        </div>
      )}
    </header>
  );
}
