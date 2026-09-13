import type { UpdateState } from "../update-types";
import { optionSubmission } from "../community-options";
import { unifiedOption } from "../option-writes";
import { UpdateDialog } from "./components/UpdateDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PRESET_AUTHOR_KEY,
  SOTNRANDO_PATH_KEY
} from "./constants";
import { CreateOptionDialog } from "./components/CreateOptionDialog";
import { AuthorSettingsDialog } from "./components/AuthorSettingsDialog";
import { DeleteOptionDialog } from "./components/DeleteOptionDialog";
import { DeletePresetDialog } from "./components/DeletePresetDialog";
import { CreatePresetDialog } from "./components/CreatePresetDialog";
import { GeneratePresetDialog } from "./components/GeneratePresetDialog";
import { PresetEditor } from "./components/PresetEditor";
import { PresetLibrary } from "./components/PresetLibrary";
import { InstalledPresetDialog } from "./components/InstalledPresetDialog";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { WindowBar } from "./components/WindowBar";
import { buildPreviewPreset, calculatePresetMaxComplexity, createPresetFromTemplate, isDatabaseOption, isJsonObject, loadPresets, normalizeComplexity, persistPresets, presetIdFromName, toPresetOptions } from "./preset-utils";
import type { CreateOptionInput, DatabaseOption, InstalledPreset, JsonObject, Preset, PresetOption } from "./types";
import { selectTemplateOptions } from "./template-options";
import { exportMatchesCurrent, type SuccessfulExport } from "./export-state";
import type { CatalogItem, CommunityStatus } from "../community-types";
import { communityRequest, subscribeCommunityStatus } from "./community-api";
import { communityItemName } from "./components/CommunityPresets";
import { LoginDialog } from "./components/LoginDialog";
import { ShareDialog } from "./components/ShareDialog";
import { Icon } from "./components/Icon";
import { JsonPreview } from "./components/JsonPreview";

async function fetchOptions(): Promise<PresetOption[]> {
  const response = await window.presetApp.listOptions();
  if (!isJsonObject(response)) throw new Error("Invalid response from the options database.");
  if (response.status === "error" && typeof response.error === "string") throw new Error(response.error);
  if (response.status !== "ok" || !Array.isArray(response.options)) throw new Error("The options database returned invalid data.");
  return toPresetOptions(response.options.map(option => isJsonObject(option) ? unifiedOption(option) : option).filter(isDatabaseOption));
}

export function App() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [options, setOptions] = useState<PresetOption[]>([]);
  const [template, setTemplate] = useState<JsonObject | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [createOptionOpen, setCreateOptionOpen] = useState(false);
  const [optionToDelete, setOptionToDelete] = useState<PresetOption | null>(null);
  const [editingOption, setEditingOption] = useState<DatabaseOption | null>(null);
  const [authorSettingsOpen, setAuthorSettingsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [communityItem, setCommunityItem] = useState<CatalogItem | null>(null);
  const [communityBusy, setCommunityBusy] = useState(false);
  const communityPending = useRef(false);
  const [communityError, setCommunityError] = useState("");
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [shareTarget, setShareTarget] = useState<PresetOption | "preset" | null>(null);
  const afterLogin = useRef<(() => void) | null>(null);
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null);
  const [author, setAuthor] = useState(() => localStorage.getItem(PRESET_AUTHOR_KEY) ?? "");
  const [signedInUsername, setSignedInUsername] = useState<string | null>(null);
  const effectiveAuthor = signedInUsername ?? author;
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [successfulExports, setSuccessfulExports] = useState<Record<string, SuccessfulExport>>({});
  const operationPending = useRef(false);
  const [toast, setToast] = useState("");
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
    let receivedEvent = false;
    let canceled = false;
    const unsubscribe = window.presetApp.updates.onState(state => { receivedEvent = true; setUpdateState(state); });
    void window.presetApp.updates.getState().then(state => { if (!canceled && !receivedEvent) setUpdateState(state); }).catch(() => {});
    return () => { canceled = true; unsubscribe(); };
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeCommunityStatus(status => setSignedInUsername(status.signedIn ? status.email : null));
    // Restore the saved session's author without requiring the login dialog.
    void communityRequest<CommunityStatus>({ action: "status" }).catch(() => {});
    return unsubscribe;
  }, []);
  useEffect(() => {
    let canceled = false;
    void window.presetApp.getDefaultSotnRandoPath().then((directory) => {
      if (!canceled && directory) setExportPath((current) => current || directory);
    }).catch((error: unknown) => {
      console.error("Unable to locate bundled sotnrando", error);
      if (!canceled) showToast("Unable to locate the bundled SOTNRando directory");
    });
    // Save only explicit choices so moving a portable app does not leave a stale default.
    return () => { canceled = true; };
  }, [showToast]);
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
    void Promise.all([window.presetApp.getPresetTemplate(), fetchOptions(), window.presetApp.getSuccessfulExports()])
      .then(([loadedTemplate, loadedOptions, loadedExports]) => {
        if (canceled) return;
        if (!isJsonObject(loadedTemplate)) throw new Error("Preset template must contain a JSON object.");
        setTemplate(loadedTemplate);
        setOptions(loadedOptions);
        setSuccessfulExports(loadedExports);
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
  const preview = useMemo(() => buildPreviewPreset(template, activePreset, options, effectiveAuthor, maximumComplexity), [activePreset, options, template, effectiveAuthor, maximumComplexity]);
  const boundedComplexity = normalizeComplexity(activePreset?.complexity, maximumComplexity);
  const previewJson = useMemo(() => preview ? JSON.stringify(preview) : "", [preview]);
  const exportKey = JSON.stringify([exportPath, presetIdFromName(activePreset?.name ?? "")]);
  const currentExport = successfulExports[exportKey];
  const canGenerate = Boolean(preview && exportMatchesCurrent(currentExport, activePresetId, exportPath, previewJson));
  const communityPreset = useMemo(() => communityItem?.kind === "presets" ? createPresetFromTemplate(communityItemName(communityItem), communityItem.data, options) : null, [communityItem, options]);
  const communityOption = useMemo(() => {
    if (communityItem?.kind !== "options") return null;
    // Public definitions omit local IDs and can omit optional write fields.
    const candidate = unifiedOption({ description: "", gameInit: false, statEdit: false, rawJson: false, ...communityItem.data, id: 0, readOnly: true });
    return isDatabaseOption(candidate) ? candidate : null;
  }, [communityItem]);

  const showLibrary = () => { setActivePresetId(null); setCommunityItem(null); setCommunityError(""); };
  const requireLogin = async (next: () => void) => {
    try {
      const status = await communityRequest<CommunityStatus>({ action: "status" });
      if (status.signedIn) next();
      else { afterLogin.current = next; setLoginOpen(true); }
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "Unable to check login."); }
  };
  const requestShare = (target: PresetOption | "preset") => {
    if (target === "preset" && !preview) { showToast("The preset preview is still loading"); return; }
    void requireLogin(() => setShareTarget(target));
  };
  const viewCommunity = (item: CatalogItem) => {
    setActivePresetId(null); setCommunityItem(item); setCommunityError("");
    void communityRequest<CatalogItem>({ action: "get", kind: item.kind, id: item.id }).then(fresh => {
      setCommunityItem(current => current?.id === item.id && current.kind === item.kind ? fresh : current);
    }).catch(cause => showToast(cause instanceof Error ? cause.message : "Unable to refresh preset."));
  };
  const vote = (value: -1 | 0 | 1) => {
    const item = communityItem;
    if (!item || communityPending.current) return;
    void requireLogin(() => {
      if (communityPending.current) return;
      communityPending.current = true; setCommunityBusy(true); setCommunityError("");
      void communityRequest<CatalogItem>({ action: "vote", kind: item.kind, id: item.id, value }).then(fresh => {
        setCommunityItem(current => current?.id === item.id && current.kind === item.kind ? fresh : current);
        setVotes(current => ({ ...current, [`${item.kind}:${item.id}`]: value }));
      }).catch(cause => setCommunityError(cause instanceof Error ? cause.message : "Unable to save vote."))
        .finally(() => { communityPending.current = false; setCommunityBusy(false); });
    });
  };
  const importCommunity = async () => {
    if (!communityItem || communityPending.current) return;
    if (!initialized) { showToast("The option catalog is still loading"); return; }
    if (communityItem.kind === "presets") {
      const preset = createPresetFromTemplate(communityItemName(communityItem).slice(0, 60), communityItem.data, options);
      setPresets(current => [...current, preset]); setActivePresetId(preset.id); setCommunityItem(null);
      showToast("Community preset copied to your local drafts");
      return;
    }
    communityPending.current = true; setCommunityBusy(true); setCommunityError("");
    try {
      const result = await communityRequest<{ alreadyImported: boolean }>({ action: "importOption", kind: "options", id: communityItem.id });
      setOptions(await fetchOptions());
      showToast(result.alreadyImported ? "This option is already in your catalog" : "Option added to your catalog");
    } catch (cause) { setCommunityError(cause instanceof Error ? cause.message : "Unable to import option."); }
    finally { communityPending.current = false; setCommunityBusy(false); }
  };

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
    setCommunityItem(null);
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

  const exportPreset = async (json = previewJson) => {
    if (!activePreset || !preview || operationPending.current) return;
    operationPending.current = true;
    setExporting(true);
    try {
      const destination = exportPath || await chooseExportPath();
      if (!destination) return;
      const key = JSON.stringify([destination, presetIdFromName(activePreset.name)]);
      setSuccessfulExports((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      const result = await window.presetApp.exportPreset({ sotnRandoPath: destination, presetName: activePreset.name, json, localPresetId: activePreset.id });
      if (!isJsonObject(result)) throw new Error("Export failed");
      if (result.status === "exported" && typeof result.path === "string" && typeof result.buildToken === "string") {
        const exported = { localPresetId: activePreset.id, directory: destination, json, buildToken: result.buildToken };
        setSuccessfulExports((current) => ({ ...current, [key]: exported }));
        showToast(`Exported and built ${result.path.split(/[\\/]/).pop() ?? "preset file"}`);
        setInstalledRevision((value) => value + 1);
        return exported;
      }
      else if (result.status === "error" && typeof result.error === "string") throw new Error(result.error);
    } catch (error) { showToast(error instanceof Error ? error.message : "Export failed"); throw error; }
    finally { operationPending.current = false; setExporting(false); }
  };

  const generatePreset = async (seedName: string) => {
    if (!canGenerate || !currentExport || operationPending.current) return;
    setGenerateDialogOpen(false);
    operationPending.current = true;
    setGenerating(true);
    try {
      const result = await window.presetApp.generatePreset(currentExport.buildToken, seedName || undefined);
      if (!isJsonObject(result)) throw new Error("Patch generation failed");
      if (result.status === "generated" && typeof result.path === "string") {
        showToast(`Generated ${result.path.split(/[\\/]/).pop() ?? "PPF patch"}`);
      } else if (result.status !== "canceled") {
        throw new Error(typeof result.error === "string" ? result.error : "Patch generation failed");
      }
    } catch (error) {
      setSuccessfulExports((current) => {
        const next = { ...current };
        delete next[exportKey];
        return next;
      });
      showToast(error instanceof Error ? error.message : "Patch generation failed");
    } finally {
      operationPending.current = false;
      setGenerating(false);
    }
  };

  const saveOption = async (input: CreateOptionInput, enableInPreset: boolean) => {
    const result = editingOption
      ? await window.presetApp.updateOption(editingOption.id, input)
      : await window.presetApp.createOption(input);
    if (!isJsonObject(result)) throw new Error("Invalid response from the options database.");
    if (result.status === "error" && typeof result.error === "string") throw new Error(result.error);
    const expectedStatus = editingOption ? "updated" : "created";
    if (result.status !== expectedStatus || !isDatabaseOption(result.option)) throw new Error(`The option could not be ${editingOption ? "updated" : "created"}.`);
    const savedOption = toPresetOptions([result.option])[0];
    setOptions(current => [...current.filter(item => item.id !== savedOption.id), savedOption].sort((a, b) => a.label.localeCompare(b.label)));
    if (!editingOption && enableInPreset && activePresetId) {
      setPresets(current => current.map(preset => preset.id === activePresetId ? { ...preset, optionIds: [...new Set([...preset.optionIds, savedOption.id])], updatedAt: new Date().toISOString() } : preset));
    }
    setCreateOptionOpen(false);
    setEditingOption(null);
    showToast(editingOption ? "Option updated" : "Option added");
  };

  const deleteOption = async () => {
    if (!optionToDelete) return;
    const result = await window.presetApp.deleteOption(optionToDelete.source.id);
    if (!isJsonObject(result) || result.status !== "deleted") throw new Error(isJsonObject(result) && typeof result.error === "string" ? result.error : "Unable to delete option.");
    const deletedId = optionToDelete.id;
    setOptions(current => current.filter(option => option.id !== deletedId));
    // Retain template matches so deselected inherited writes stay disabled.
    setPresets(current => current.map(preset => preset.optionIds.includes(deletedId) ? { ...preset, optionIds: preset.optionIds.filter(id => id !== deletedId), updatedAt: new Date().toISOString() } : preset));
    setOptionToDelete(null);
    showToast("Option deleted");
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

  const updateOpen = Boolean(initialized && !updateDismissed && updateState?.release && ["available", "downloading", "ready", "restarting", "error"].includes(updateState.phase)
    && !exporting && !generating && !communityBusy && !createPresetOpen && !createOptionOpen && !authorSettingsOpen && !loginOpen && !shareTarget && !presetToDelete && !optionToDelete && !viewingInstalled);
  const restartForUpdate = useCallback(async () => {
    persistPresets(presets);
    const result = await window.presetApp.updates.restart();
    if (result.status === "error") throw new Error(result.error);
  }, [presets]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (loginOpen || shareTarget || communityItem || optionToDelete || updateOpen) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "n") { event.preventDefault(); setCreatePresetOpen(true); }
      else if (key === "s" && activePreset) { event.preventDefault(); showToast("Preset saved locally"); }
      else if (key === "k" && activePreset) { event.preventDefault(); document.querySelector<HTMLInputElement>("#optionSearch")?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activePreset, loginOpen, shareTarget, communityItem, optionToDelete, updateOpen, showToast]);

  const share = async (description?: string) => {
    if (!shareTarget) return;
    const account = await communityRequest<CommunityStatus>({ action: "status" });
    if (!account.signedIn) { setLoginOpen(true); throw new Error("Sign in to share, then confirm again."); }
    let item: CatalogItem;
    if (shareTarget === "preset") {
      if (!activePreset || !description?.trim()) throw new Error("Enter a description before sharing.");
      const sharedPreset = { ...activePreset, description: description.trim() };
      const sharedPreview = buildPreviewPreset(template, sharedPreset, options, effectiveAuthor, maximumComplexity);
      if (!sharedPreview) throw new Error("Preset template is unavailable.");
      const sharedJson = JSON.stringify(sharedPreview);
      updateActivePreset({ description: sharedPreset.description });
      const built = exportMatchesCurrent(currentExport, activePresetId, exportPath, sharedJson) ? currentExport : await exportPreset(sharedJson);
      if (!built) throw new Error("Export and build the preset to continue sharing.");
      item = await communityRequest<CatalogItem>({ action: "sharePreset", buildToken: built.buildToken });
    } else {
      item = await communityRequest<CatalogItem>({ action: "shareOption", localId: shareTarget.source.id });
    }
    setShareTarget(null); showToast(`Shared “${communityItemName(item)}” with the community`);
  };
  const communityVote = communityItem ? votes[`${communityItem.kind}:${communityItem.id}`] : undefined;
  const communityActions = communityItem && <>
    <button className="button button-primary" disabled={communityBusy || !initialized} onClick={() => void importCommunity()}>{communityItem.kind === "presets" ? "Use as template" : "Add to my options"}</button>
    <div className="preset-votes" aria-label="Community votes">
      <button className="button button-ghost button-with-icon" disabled={communityBusy} aria-label={`Upvote, ${communityItem.upvotes} upvotes`} aria-pressed={communityVote === 1} onClick={() => vote(communityVote === 1 ? 0 : 1)}><Icon name="thumb-up" />{communityItem.upvotes}</button>
      <button className="button button-ghost button-with-icon" disabled={communityBusy} aria-label={`Downvote, ${communityItem.downvotes} downvotes`} aria-pressed={communityVote === -1} onClick={() => vote(communityVote === -1 ? 0 : -1)}><Icon name="thumb-down" />{communityItem.downvotes}</button>
      <button className="text-button" disabled={communityBusy} onClick={() => vote(0)}>Remove my vote</button>
    </div>
  </>;

  return (
    <>
      <div className="app-shell">
        <WindowBar onCommunity={() => { afterLogin.current = null; setLoginOpen(true); }} editing={Boolean(activePreset)} exportPath={exportPath} author={author} onEditAuthor={() => setAuthorSettingsOpen(true)} onDeletePreset={() => setPresetToDelete(activePreset)} onNewPreset={() => setCreatePresetOpen(true)} onSavePreset={() => showToast("Preset saved locally")} onShowLibrary={showLibrary} onChooseExportPath={() => void chooseExportPath()} />
        <TopBar communityActions={communityActions} onShare={() => requestShare("preset")} editing={Boolean(activePreset || communityItem)} presetCount={presets.length} exporting={exporting} generating={generating} canGenerate={canGenerate} onNewPreset={() => setCreatePresetOpen(true)} onBack={showLibrary} onExport={() => { void exportPreset().catch(() => {}); }} onGenerate={() => setGenerateDialogOpen(true)} onSave={() => showToast("Preset saved locally")} />
        {communityItem ? <div className="community-preset-view">
          {communityError && <p className="community-error" role="alert">{communityError}</p>}
          {communityPreset ? <PresetEditor key={communityItem.id} readOnly preset={communityPreset} maximumComplexity={Math.max(communityPreset.complexity, calculatePresetMaxComplexity(template, communityPreset, options))} options={options.filter(option => communityPreset.optionIds.includes(option.id))} preview={communityItem.data} onChange={() => {}} onNewOption={() => {}} onEditOption={() => {}} onShareOption={() => {}} onDeleteOption={() => {}} onCopy={() => { void navigator.clipboard.writeText(JSON.stringify(communityItem.data, null, 2)).then(() => showToast("Copied community JSON"), () => showToast("Unable to copy JSON")); }} /> : communityOption ? <CreateOptionDialog key={communityItem.id} inline open option={communityOption} options={[]} onClose={showLibrary} /> : <main className="workspace"><section className="options-pane"><span className="step-label">Community option</span><h2>{communityItemName(communityItem)}</h2><p>This definition cannot be displayed in the option editor. Its original JSON is available for inspection.</p></section><JsonPreview community preview={communityItem.data} onCopy={() => { void navigator.clipboard.writeText(JSON.stringify(communityItem.data, null, 2)).then(() => showToast("Copied option JSON"), () => showToast("Unable to copy JSON")); }} /></main>}
          {communityItem.kind === "presets" && <p className="community-template-note">Use as template to edit a local copy. The editor rebuilds location rules and does not resolve inherited presets; review the resulting JSON before exporting.</p>}
        </div> : activePreset ? <PresetEditor key={activePreset.id} preset={{ ...activePreset, complexity: boundedComplexity }} maximumComplexity={maximumComplexity} options={options} preview={preview} onChange={updateActivePreset} onNewOption={() => { setEditingOption(null); setCreateOptionOpen(true); }} onEditOption={(option) => { setEditingOption(option.source); setCreateOptionOpen(true); }} onShareOption={requestShare} onDeleteOption={setOptionToDelete} onCopy={() => void copyPreview()} /> : <PresetLibrary onViewCommunity={viewCommunity} presets={presets} optionLabels={optionLabels} onCreate={() => setCreatePresetOpen(true)} onOpen={(preset) => setActivePresetId(preset.id)} onDelete={setPresetToDelete} installedPresets={installedPresets} installedConfigured={Boolean(exportPath)} installedLoading={installedLoading} installedMessage={installedMessage} onViewInstalled={setViewingInstalled} onRefreshInstalled={() => setInstalledRevision((value) => value + 1)} />}
      </div>
      <CreatePresetDialog open={createPresetOpen} installedPresets={installedPresets} loading={installedLoading} message={installedMessage} initialTemplate={initialTemplate} onClose={() => { setCreatePresetOpen(false); setInitialTemplate(""); }} onSubmit={createPreset} />
      {generateDialogOpen && <GeneratePresetDialog onClose={() => setGenerateDialogOpen(false)} onSubmit={seedName => void generatePreset(seedName)} />}
      <InstalledPresetDialog preset={viewingInstalled} onClose={() => setViewingInstalled(null)} onCreate={(preset) => { setViewingInstalled(null); setInitialTemplate(preset.fileName); setCreatePresetOpen(true); }} onCopy={(preset) => { void navigator.clipboard.writeText(JSON.stringify(preset.json, null, 2)).then(() => showToast("Copied installed JSON"), () => showToast("Unable to copy JSON")); }} />
      {!communityOption && <CreateOptionDialog open={createOptionOpen} option={editingOption} options={options.map(item => item.source)} onClose={closeOptionDialog} onSubmit={saveOption} />}
      <AuthorSettingsDialog open={authorSettingsOpen} author={author} onClose={() => setAuthorSettingsOpen(false)} onSave={saveAuthor} />
      <DeletePresetDialog preset={presetToDelete} onClose={() => setPresetToDelete(null)} onDelete={deletePreset} />
      {optionToDelete && <DeleteOptionDialog option={optionToDelete} onClose={() => setOptionToDelete(null)} onDelete={deleteOption} />}
      <Toast message={toast} />
      {updateOpen && updateState && <UpdateDialog state={updateState} onLater={() => setUpdateDismissed(true)} onRestart={restartForUpdate} />}
      {shareTarget && (shareTarget !== "preset" || preview) && <ShareDialog name={shareTarget === "preset" ? activePreset?.name ?? "Preset" : shareTarget.label} kind={shareTarget === "preset" ? "preset" : "option"} json={shareTarget === "preset" ? preview! : optionSubmission(shareTarget.source)} needsBuild={shareTarget === "preset" && !canGenerate} onClose={() => setShareTarget(null)} onShare={share} />}
      {loginOpen && <LoginDialog onClose={() => { setLoginOpen(false); setVotes({}); afterLogin.current = null; }} onSignedIn={() => { setLoginOpen(false); setVotes({}); const next = afterLogin.current; afterLogin.current = null; next?.(); }} />}
    </>
  );
}
