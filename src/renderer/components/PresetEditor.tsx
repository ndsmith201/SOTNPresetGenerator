import type { JsonObject, Preset, PresetOption } from "../types";
import { JsonPreview } from "./JsonPreview";
import { OptionsPane } from "./OptionsPane";
import { TemplateDevelopmentBanner } from "./TemplateDevelopmentBanner";
import { hasPresetEdits, normalizeComplexity } from "../preset-utils";

interface PresetEditorProps {
  preset: Preset;
  options: PresetOption[];
  maximumComplexity: number;
  preview: JsonObject | null;
  onChange: (changes: Partial<Preset>) => void;
  onNewOption: () => void;
  onEditOption: (option: PresetOption) => void;
  onShareOption: (option: PresetOption) => void;
  onDeleteOption: (option: PresetOption) => void;
  readOnly?: boolean;
  onCopy: () => void;
}

export function PresetEditor(props: PresetEditorProps) {
  const showTemplateNotice = !props.readOnly && props.preset.baseTemplate
    && hasPresetEdits(props.preset.baseTemplate, props.preset, props.options,
      normalizeComplexity(props.preset.complexity, props.maximumComplexity), props.maximumComplexity);
  return (
    <main className={`workspace${showTemplateNotice ? " workspace-with-template-notice" : ""}`}>
      {showTemplateNotice && <TemplateDevelopmentBanner />}
      <OptionsPane preset={props.preset} options={props.options} maximumComplexity={props.maximumComplexity} onChange={props.onChange} onNewOption={props.onNewOption} onEditOption={props.onEditOption} onShareOption={props.onShareOption} onDeleteOption={props.onDeleteOption} readOnly={props.readOnly} />
      <JsonPreview community={props.readOnly} preview={props.preview} onCopy={props.onCopy} />
    </main>
  );
}
