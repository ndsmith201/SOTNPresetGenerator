import { BUILT_IN_TOGGLES } from "../constants";
import type { BuiltInSettings as BuiltInSettingsType } from "../types";
import { Icon } from "./Icon";

interface BuiltInSettingsProps {
  value: BuiltInSettingsType;
  onChange: (value: BuiltInSettingsType) => void;
}

export function BuiltInSettings({ value, onChange }: BuiltInSettingsProps) {
  const enabledCount = Object.values(value).filter(Boolean).length;
  return (
    <details className="built-in-settings">
      <summary>
        <span><strong>Built-in modes</strong><small>Preset-level randomizer switches</small></span>
        <span className="built-in-summary-count">{enabledCount} enabled</span>
        <Icon name="arrow" />
      </summary>
      <div className="built-in-toggle-grid">
        {BUILT_IN_TOGGLES.map((toggle) => (
          <label className="built-in-toggle" key={toggle.key}>
            <span>{toggle.label}</span>
            <input type="checkbox" checked={value[toggle.key]} onChange={(event) => onChange({ ...value, [toggle.key]: event.target.checked })} />
            <span className="toggle-switch" aria-hidden="true" />
          </label>
        ))}
      </div>
    </details>
  );
}
