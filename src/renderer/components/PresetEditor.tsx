import type { JsonObject, Preset, PresetOption } from "../types";
import { JsonPreview } from "./JsonPreview";
import { OptionsPane } from "./OptionsPane";

interface PresetEditorProps {
  preset: Preset;
  options: PresetOption[];
  maximumComplexity: number;
  preview: JsonObject | null;
  onChange: (changes: Partial<Preset>) => void;
  onNewOption: () => void;
  onEditOption: (option: PresetOption) => void;
  onCopy: () => void;
}

export function PresetEditor(props: PresetEditorProps) {
  return (
    <main className="workspace">
      <OptionsPane preset={props.preset} options={props.options} maximumComplexity={props.maximumComplexity} onChange={props.onChange} onNewOption={props.onNewOption} onEditOption={props.onEditOption} />
      <JsonPreview preview={props.preview} onCopy={props.onCopy} />
    </main>
  );
}
