import type { JsonObject, Preset, PresetOption } from "../types";
import { JsonPreview } from "./JsonPreview";
import { OptionsPane } from "./OptionsPane";

interface PresetEditorProps {
  preset: Preset;
  options: PresetOption[];
  preview: JsonObject | null;
  onChange: (changes: Partial<Preset>) => void;
  onNewOption: () => void;
  onCopy: () => void;
}

export function PresetEditor(props: PresetEditorProps) {
  return <main className="workspace"><OptionsPane preset={props.preset} options={props.options} onChange={props.onChange} onNewOption={props.onNewOption} /><JsonPreview preview={props.preview} optionCount={props.preset.optionIds.length} onCopy={props.onCopy} /></main>;
}
