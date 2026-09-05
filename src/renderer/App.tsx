import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPACT_MODE_KEY,
  DEFAULT_BUILT_IN_SETTINGS,
  DEFAULT_COMPLEXITY,
  DEFAULT_META_EXTENSION,
  JSON_WRAP_KEY,
  SOTNRANDO_PATH_KEY
} from "./constants";
import { CreateOptionDialog } from "./components/CreateOptionDialog";
import { CreatePresetDialog } from "./components/CreatePresetDialog";
import { PresetEditor } from "./components/PresetEditor";
import { PresetLibrary } from "./components/PresetLibrary";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { WindowBar } from "./components/WindowBar";
import { buildPreviewPreset, isDatabaseOption, isJsonObject, loadPresets, persistPresets, toPresetOptions } from "./preset-utils";
import type { CreateOptionInput, JsonObject, Preset, PresetOption } from "./types";

async function fetchOptions(): Promise<PresetOption[]> {
  const response = await window.presetApp.listOptions();
  if (!isJsonObject(response)) throw new Error("Invalid response from the options database.");
  if (response.status === "error" && typeof response.error === "string") throw new Error(response.error);
  if (response.status !== "ok" || !Array.isArray(response.options)) throw new Error("The options database returned invalid data.");
  return toPresetOptions(response.options.filter(isDatabaseOption));
}

export function App() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [options, setOptions] = useState<PresetOption[]>([]);
  const [template, setTemplate] = useState<JsonObject | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [createOptionOpen, setCreateOptionOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem(COMPACT_MODE_KEY) === "true");
  const [wrapJson, setWrapJson] = useState(() => localStorage.getItem(JSON_WRAP_KEY) === "true");
  const [exportPath, setExportPath] = useState(() => localStorage.getItem(SOTNRANDO_PATH_KEY) ?? "");
  const toastTimer = useRef<number>();

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    document.body.classList.toggle("compact-mode", compactMode);
    localStorage.setItem(COMPACT_MODE_KEY, compactMode.toString());
  }, [compactMode]);
  useEffect(() => {
    document.body.classList.toggle("wrap-json", wrapJson);
    localStorage.setItem(JSON_WRAP_KEY, wrapJson.toString());
  }, [wrapJson]);
  useEffect(() => {
    if (initialized) persistPresets(presets);
  }, [initialized, presets]);

  useEffect(() => {
    let canceled = false;
    void Promise.all([window.presetApp.getPresetTemplate(), fetchOptions()])
      .then(([loadedTemplate, loadedOptions]) => {
        if (canceled) return;
        if (!isJsonObject(loadedTemplate)) throw new Error("Preset template must contain a JSON object.");
        setTemplate(loadedTemplate);
        setOptions(loadedOptions);
        setPresets(loadPresets(new Set(loadedOptions.map((option) => option.id))));
        setInitialized(true);
      })
      .catch((error: unknown) => {
        console.error("Unable to initialize the renderer", error);
        if (!canceled) {
          setPresets(loadPresets());
          setInitialized(true);
          showToast(error instanceof Error ? error.message : "Unable to initialize the app.");
        }
      });
    return () => { canceled = true; };
  }, [showToast]);

  const activePreset = useMemo(() => presets.find((preset) => preset.id === activePresetId) ?? null, [activePresetId, presets]);
  const optionLabels = useMemo(() => new Map(options.map((option) => [option.id, option.label])), [options]);
  const preview = useMemo(() => buildPreviewPreset(template, activePreset, options), [activePreset, options, template]);

  const updateActivePreset = useCallback((changes: Partial<Preset>) => {
    if (!activePresetId) return;
    setPresets((current) => current.map((preset) => preset.id === activePresetId ? { ...preset, ...changes, updatedAt: new Date().toISOString() } : preset));
  }, [activePresetId]);

  const createPreset = (name: string) => {
    const timestamp = new Date().toISOString();
    const preset: Preset = { id: crypto.randomUUID(), name, optionIds: [], complexity: DEFAULT_COMPLEXITY, metaExtension: DEFAULT_META_EXTENSION, builtInSettings: { ...DEFAULT_BUILT_IN_SETTINGS }, createdAt: timestamp, updatedAt: timestamp };
    setPresets((current) => [...current, preset]);
    setActivePresetId(preset.id);
    setCreatePresetOpen(false);
  };

  const resetActivePreset = () => updateActivePreset({ optionIds: [], complexity: DEFAULT_COMPLEXITY, metaExtension: DEFAULT_META_EXTENSION, builtInSettings: { ...DEFAULT_BUILT_IN_SETTINGS } });

  const chooseExportPath = useCallback(async (): Promise<string | null> => {
    const result = await window.presetApp.chooseSotnRandoPath(exportPath || undefined);
    if (!isJsonObject(result)) { showToast("Unable to choose a directory"); return null; }
    if (result.canceled === true) return null;
    if (typeof result.error === "string") { showToast(result.error); return null; }
    if (typeof result.path !== "string") return null;
    setExportPath(result.path);
    localStorage.setItem(SOTNRANDO_PATH_KEY, result.path);
    showToast("SOTNRando directory updated");
    return result.path;
  }, [exportPath, showToast]);

  const exportPreset = async () => {
    if (!activePreset || !preview) return;
    const destination = exportPath || await chooseExportPath();
    if (!destination) return;
    setExporting(true);
    try {
      const result = await window.presetApp.exportPreset({ sotnRandoPath: destination, presetName: activePreset.name, json: JSON.stringify(preview) });
      if (!isJsonObject(result)) throw new Error("Export failed");
      if (result.status === "exported" && typeof result.path === "string") showToast(`Exported and built ${result.path.split(/[\\/]/).pop() ?? "preset file"}`);
      else if (result.status === "error" && typeof result.error === "string") throw new Error(result.error);
    } catch (error) { showToast(error instanceof Error ? error.message : "Export failed"); }
    finally { setExporting(false); }
  };

  const createOption = async (input: CreateOptionInput) => {
    const result = await window.presetApp.createOption(input);
    if (!isJsonObject(result)) throw new Error("Invalid response from the options database.");
    if (result.status === "error" && typeof result.error === "string") throw new Error(result.error);
    if (result.status !== "created" || !isDatabaseOption(result.option)) throw new Error("The option could not be created.");
    setOptions(await fetchOptions());
    setCreateOptionOpen(false);
    showToast("Option added");
  };

  const copyPreview = async () => {
    if (!preview) { showToast("Template is unavailable"); return; }
    await navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
    showToast("Copied to clipboard");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "n") { event.preventDefault(); setCreatePresetOpen(true); }
      else if (key === "s" && activePreset) { event.preventDefault(); showToast("Preset saved locally"); }
      else if (key === "k" && activePreset) { event.preventDefault(); document.querySelector<HTMLInputElement>("#optionSearch")?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activePreset, showToast]);

  return (
    <>
      <div className="app-shell">
        <WindowBar editing={Boolean(activePreset)} compactMode={compactMode} wrapJson={wrapJson} exportPath={exportPath} onNewPreset={() => setCreatePresetOpen(true)} onSavePreset={() => showToast("Preset saved locally")} onShowLibrary={() => setActivePresetId(null)} onToggleCompact={() => setCompactMode((value) => !value)} onToggleWrap={() => setWrapJson((value) => !value)} onChooseExportPath={() => void chooseExportPath()} />
        <TopBar editing={Boolean(activePreset)} presetCount={presets.length} exporting={exporting} onNewPreset={() => setCreatePresetOpen(true)} onBack={() => setActivePresetId(null)} onReset={resetActivePreset} onExport={() => void exportPreset()} onSave={() => showToast("Preset saved locally")} />
        {activePreset ? <PresetEditor preset={activePreset} options={options} preview={preview} onChange={updateActivePreset} onNewOption={() => setCreateOptionOpen(true)} onCopy={() => void copyPreview()} /> : <PresetLibrary presets={presets} optionLabels={optionLabels} onCreate={() => setCreatePresetOpen(true)} onOpen={(preset) => setActivePresetId(preset.id)} />}
      </div>
      <CreatePresetDialog open={createPresetOpen} onClose={() => setCreatePresetOpen(false)} onSubmit={createPreset} />
      <CreateOptionDialog open={createOptionOpen} onClose={() => setCreateOptionOpen(false)} onSubmit={createOption} />
      <Toast message={toast} />
    </>
  );
}
