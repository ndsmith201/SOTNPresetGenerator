import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPACT_MODE_KEY,
  JSON_WRAP_KEY,
  PRESET_AUTHOR_KEY,
  SOTNRANDO_PATH_KEY
} from "./constants";
import { CreateOptionDialog } from "./components/CreateOptionDialog";
import { AuthorSettingsDialog } from "./components/AuthorSettingsDialog";
import { DeletePresetDialog } from "./components/DeletePresetDialog";
import { CreatePresetDialog } from "./components/CreatePresetDialog";
import { PresetEditor } from "./components/PresetEditor";
import { PresetLibrary } from "./components/PresetLibrary";
import { InstalledPresetDialog } from "./components/InstalledPresetDialog";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { WindowBar } from "./components/WindowBar";
import { buildPreviewPreset, calculatePresetMaxComplexity, createPresetFromTemplate, isDatabaseOption, isJsonObject, loadPresets, normalizeComplexity, persistPresets, toPresetOptions } from "./preset-utils";
import type { CreateOptionInput, DatabaseOption, InstalledPreset, JsonObject, Preset, PresetOption } from "./types";
import { selectTemplateOptions } from "./template-options";

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
  const [editingOption, setEditingOption] = useState<DatabaseOption | null>(null);
  const [authorSettingsOpen, setAuthorSettingsOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const [author, setAuthor] = useState(() => localStorage.getItem(PRESET_AUTHOR_KEY) ?? "");
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem(COMPACT_MODE_KEY) === "true");
  const [wrapJson, setWrapJson] = useState(() => localStorage.getItem(JSON_WRAP_KEY) === "true");
  const [exportPath, setExportPath] = useState(() => localStorage.getItem(SOTNRANDO_PATH_KEY) ?? "");
  const [installedPresets, setInstalledPresets] = useState<InstalledPreset[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedMessage, setInstalledMessage] = useState("");
  const [installedRevision, setInstalledRevision] = useState(0);
  const [viewingInstalled, setViewingInstalled] = useState<InstalledPreset | null>(null);
  const [initialTemplate, setInitialTemplate] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

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
    setInstalledPresets([]);
    setInstalledMessage("");
    setViewingInstalled(null);
    setInstalledLoading(Boolean(exportPath));
    if (exportPath) {
      void window.presetApp.listInstalledPresets(exportPath).then((result) => {
        if (canceled) return;
        if (!isJsonObject(result)) throw new Error("Unable to load installed presets.");
        if (result.status === "error") throw new Error(String(result.error));
        if (result.status !== "ok" || !Array.isArray(result.presets)) throw new Error("Invalid installed presets response.");
        const loaded = result.presets.filter((item): item is InstalledPreset => isJsonObject(item) &&
          typeof item.fileName === "string" && typeof item.name === "string" && isJsonObject(item.json));
        setInstalledPresets(loaded);
        setInstalledMessage(Array.isArray(result.warnings) ? result.warnings.filter((warning) => typeof warning === "string").join("\n") : "");
      }).catch((error: unknown) => {
        if (!canceled) setInstalledMessage(error instanceof Error ? error.message : "Unable to load installed presets.");
      }).finally(() => { if (!canceled) setInstalledLoading(false); });
    }
    return () => { canceled = true; };
  }, [exportPath, installedRevision]);

  useEffect(() => {
    let canceled = false;
    void Promise.all([window.presetApp.getPresetTemplate(), fetchOptions()])
      .then(([loadedTemplate, loadedOptions]) => {
        if (canceled) return;
        if (!isJsonObject(loadedTemplate)) throw new Error("Preset template must contain a JSON object.");
        setTemplate(loadedTemplate);
        setOptions(loadedOptions);
        setPresets(loadPresets(new Set(loadedOptions.map((option) => option.id))).map((preset) => selectTemplateOptions(preset, loadedOptions)));
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
  const maximumComplexity = useMemo(() => calculatePresetMaxComplexity(template, activePreset, options), [template, options, activePreset?.baseTemplate, activePreset?.metaExtension, activePreset?.optionIds]);
  const preview = useMemo(() => buildPreviewPreset(template, activePreset, options, author, maximumComplexity), [activePreset, options, template, author, maximumComplexity]);
  const boundedComplexity = normalizeComplexity(activePreset?.complexity, maximumComplexity);

  const saveAuthor = (value: string) => {
    setAuthor(value);
    localStorage.setItem(PRESET_AUTHOR_KEY, value);
    setAuthorSettingsOpen(false);
    showToast("Preset author updated");
  };

  const deletePreset = (id: string) => {
    setPresets((current) => current.filter((preset) => preset.id !== id));
    if (activePresetId === id) setActivePresetId(null);
    setPresetToDelete(null);
    showToast("Preset deleted");
  };

  const updateActivePreset = useCallback((changes: Partial<Preset>) => {
    if (!activePresetId) return;
    setPresets((current) => current.map((preset) => preset.id === activePresetId ? { ...preset, ...changes, updatedAt: new Date().toISOString() } : preset));
  }, [activePresetId]);

  useEffect(() => {
    if (template && activePreset && activePreset.complexity !== boundedComplexity) {
      updateActivePreset({ complexity: boundedComplexity });
    }
  }, [template, activePreset, boundedComplexity, updateActivePreset]);

  const createPreset = (name: string, fileName: string) => {
    if (!initialized) { showToast("The option catalog is still loading"); return; }
    const source = fileName ? installedPresets.find((preset) => preset.fileName === fileName) : undefined;
    if (fileName && !source) { showToast("The selected template is unavailable"); return; }
    const preset = createPresetFromTemplate(name, source?.json, options);
    setPresets((current) => [...current, preset]);
    setActivePresetId(preset.id);
    setCreatePresetOpen(false);
    setInitialTemplate("");
  };

  const chooseExportPath = useCallback(async (): Promise<string | null> => {
    const result = await window.presetApp.chooseSotnRandoPath(exportPath || undefined);
    if (!isJsonObject(result)) { showToast("Unable to choose a directory"); return null; }
    if (result.canceled === true) return null;
    if (typeof result.error === "string") { showToast(result.error); return null; }
    if (typeof result.path !== "string") return null;
    setExportPath(result.path);
    setInstalledRevision((value) => value + 1);
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
      if (result.status === "exported" && typeof result.path === "string") {
        showToast(`Exported and built ${result.path.split(/[\\/]/).pop() ?? "preset file"}`);
        setInstalledRevision((value) => value + 1);
      }
      else if (result.status === "error" && typeof result.error === "string") throw new Error(result.error);
    } catch (error) { showToast(error instanceof Error ? error.message : "Export failed"); }
    finally { setExporting(false); }
  };

  const saveOption = async (input: CreateOptionInput) => {
    const result = editingOption
      ? await window.presetApp.updateOption(editingOption.id, input)
      : await window.presetApp.createOption(input);
    if (!isJsonObject(result)) throw new Error("Invalid response from the options database.");
    if (result.status === "error" && typeof result.error === "string") throw new Error(result.error);
    const expectedStatus = editingOption ? "updated" : "created";
    if (result.status !== expectedStatus || !isDatabaseOption(result.option)) throw new Error(`The option could not be ${editingOption ? "updated" : "created"}.`);
    setOptions(await fetchOptions());
    setCreateOptionOpen(false);
    setEditingOption(null);
    showToast(editingOption ? "Option updated" : "Option added");
  };

  const closeOptionDialog = () => {
    setCreateOptionOpen(false);
    setEditingOption(null);
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
        <WindowBar editing={Boolean(activePreset)} compactMode={compactMode} wrapJson={wrapJson} exportPath={exportPath} author={author} onEditAuthor={() => setAuthorSettingsOpen(true)} onDeletePreset={() => setPresetToDelete(activePreset)} onNewPreset={() => setCreatePresetOpen(true)} onSavePreset={() => showToast("Preset saved locally")} onShowLibrary={() => setActivePresetId(null)} onToggleCompact={() => setCompactMode((value) => !value)} onToggleWrap={() => setWrapJson((value) => !value)} onChooseExportPath={() => void chooseExportPath()} />
        <TopBar editing={Boolean(activePreset)} presetCount={presets.length} exporting={exporting} onNewPreset={() => setCreatePresetOpen(true)} onBack={() => setActivePresetId(null)} onExport={() => void exportPreset()} onSave={() => showToast("Preset saved locally")} />
        {activePreset ? <PresetEditor key={activePreset.id} preset={{ ...activePreset, complexity: boundedComplexity }} maximumComplexity={maximumComplexity} options={options} preview={preview} onChange={updateActivePreset} onNewOption={() => { setEditingOption(null); setCreateOptionOpen(true); }} onEditOption={(option) => { setEditingOption(option.source); setCreateOptionOpen(true); }} onCopy={() => void copyPreview()} /> : <PresetLibrary presets={presets} optionLabels={optionLabels} onCreate={() => setCreatePresetOpen(true)} onOpen={(preset) => setActivePresetId(preset.id)} onDelete={setPresetToDelete} installedPresets={installedPresets} installedConfigured={Boolean(exportPath)} installedLoading={installedLoading} installedMessage={installedMessage} onViewInstalled={setViewingInstalled} onRefreshInstalled={() => setInstalledRevision((value) => value + 1)} />}
      </div>
      <CreatePresetDialog open={createPresetOpen} installedPresets={installedPresets} loading={installedLoading} message={installedMessage} initialTemplate={initialTemplate} onClose={() => { setCreatePresetOpen(false); setInitialTemplate(""); }} onSubmit={createPreset} />
      <InstalledPresetDialog preset={viewingInstalled} onClose={() => setViewingInstalled(null)} onCreate={(preset) => { setViewingInstalled(null); setInitialTemplate(preset.fileName); setCreatePresetOpen(true); }} onCopy={(preset) => { void navigator.clipboard.writeText(JSON.stringify(preset.json, null, 2)).then(() => showToast("Copied installed JSON"), () => showToast("Unable to copy JSON")); }} />
      <CreateOptionDialog open={createOptionOpen} option={editingOption} onClose={closeOptionDialog} onSubmit={saveOption} />
      <AuthorSettingsDialog open={authorSettingsOpen} author={author} onClose={() => setAuthorSettingsOpen(false)} onSave={saveAuthor} />
      <DeletePresetDialog preset={presetToDelete} onClose={() => setPresetToDelete(null)} onDelete={deletePreset} />
      <Toast message={toast} />
    </>
  );
}
