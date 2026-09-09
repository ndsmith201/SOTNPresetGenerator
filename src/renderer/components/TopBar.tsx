import { Icon } from "./Icon";
import { useId } from "react";

interface TopBarProps {
  editing: boolean;
  presetCount: number;
  exporting: boolean;
  generating: boolean;
  canGenerate: boolean;
  onNewPreset: () => void;
  onBack: () => void;
  onExport: () => void;
  onGenerate: () => void;
  onSave: () => void;
}

export function TopBar(props: TopBarProps) {
  const tooltipId = useId();
  const generateDisabled = !props.canGenerate || props.exporting || props.generating;
  const disabledReason = props.generating ? "Generating a PPF patch…" : "Export and build the preset first.";
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 3.5 27 9.8v12.4L16 28.5 5 22.2V9.8L16 3.5Z" /><path d="m10.5 15.8 3.4 3.5 7.8-8" /></svg></div>
        <div className="brand-copy"><span className="eyebrow">Randomizer tools</span><h1>SOTN Preset Generator</h1></div>
        {props.editing && <button className="button button-ghost button-with-icon presets-back-button" type="button" aria-label="Back to presets" onClick={props.onBack}><Icon name="back" />Presets</button>}
      </div>
      {!props.editing ? (
        <div className="topbar-actions">
          <span className="preset-total"><strong>{props.presetCount}</strong> presets</span>
          <button className="button button-primary" type="button" onClick={props.onNewPreset}><Icon name="plus" />New preset</button>
        </div>
      ) : (
        <div className="topbar-actions">
          <button className="button button-ghost button-with-icon" type="button" disabled={props.exporting || props.generating} onClick={props.onExport}><Icon name="download" />{props.exporting ? "Building…" : "Export"}</button>
          <span className="generate-action" tabIndex={generateDisabled ? 0 : undefined} aria-describedby={generateDisabled ? tooltipId : undefined}>
            <button className="button button-ghost button-with-icon" type="button" disabled={generateDisabled} aria-describedby={generateDisabled ? tooltipId : undefined} onClick={props.onGenerate}><Icon name="spark" />{props.generating ? "Generating…" : "Generate"}</button>
            {generateDisabled && <span className="generate-tooltip" role="tooltip" id={tooltipId}>{disabledReason}</span>}
          </span>
          <button className="button button-primary" type="button" onClick={props.onSave}>Save preset</button>
        </div>
      )}
    </header>
  );
}
