import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItem, CatalogKind, CatalogPage, CommunityStatus } from "../../community-types";
import type { JsonObject, PresetOption } from "../types";
import { communityRequest } from "../community-api";
import { CommunityAccount } from "./CommunityAccount";
import { Icon } from "./Icon";

type Tab = CatalogKind | "share" | "account";
export function communityItemName(item: CatalogItem): string {
  const metadata = item.data.metadata as Record<string, unknown> | undefined;
  return String(item.kind === "options" ? item.data.comment : metadata?.name || "Untitled preset");
}

export function CommunityDialog({ options, presetName, preview, buildToken, onClose, onOptionsImported, onPresetImported }: {
  options: PresetOption[];
  presetName: string;
  preview: JsonObject | null;
  buildToken?: string;
  onClose: () => void;
  onOptionsImported: () => Promise<void>;
  onPresetImported: (name: string, json: JsonObject) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<CommunityStatus | null>(null);
  const [tab, setTab] = useState<Tab>("presets");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [shareKind, setShareKind] = useState<CatalogKind>("presets");
  const [localOptionId, setLocalOptionId] = useState("");
  const [submittedKey, setSubmittedKey] = useState("");
  const [importName, setImportName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const pageVersion = useRef(0);

  const run = useCallback((operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    void operation().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Community operation failed."))
      .finally(async () => {
        try { setAccount(await communityRequest<CommunityStatus>({ action: "status" })); } catch { /* Retain the operation error. */ }
        pending.current = false; setBusy(false);
      });
  }, []);

  useEffect(() => {
    dialogRef.current?.showModal();
    let canceled = false;
    void communityRequest<CommunityStatus>({ action: "status" }).then(result => { if (!canceled) setAccount(result); }).catch((cause: unknown) => { if (!canceled) setError(cause instanceof Error ? cause.message : "Unable to load community settings."); });
    return () => { canceled = true; pageVersion.current++; };
  }, []);

  const endpoint = account?.config.apiUrl;
  useEffect(() => {
    setSelected(null); setItems([]); setCursor(undefined); setSearch(""); setLoaded(false);
    const version = ++pageVersion.current;
    if (!endpoint || (tab !== "options" && tab !== "presets")) return;
    // This effect owns page loading. Discard results from a closed or changed view.
    pending.current = true; setBusy(true); setError("");
    void communityRequest<CatalogPage>({ action: "list", kind: tab }).then(page => {
      if (version !== pageVersion.current) return;
      setItems(page.items); setCursor(page.nextCursor); setLoaded(true);
    }).catch((cause: unknown) => {
      if (version === pageVersion.current) setError(cause instanceof Error ? cause.message : "Unable to load the community catalog.");
    }).finally(() => { if (version === pageVersion.current) { pending.current = false; setBusy(false); } });
  }, [tab, endpoint]);

  const refresh = (more: boolean) => run(async () => {
    if (tab !== "options" && tab !== "presets") return;
    const page = await communityRequest<CatalogPage>({ action: "list", kind: tab, cursor: more ? cursor : undefined });
    if (more && cursor && page.nextCursor === cursor) throw new Error("The service returned the same page cursor. Refresh the catalog to continue.");
    setItems(current => more ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items);
    setCursor(page.nextCursor); setLoaded(true);
    if (!more) setSelected(null);
  });
  const view = (item: CatalogItem) => run(async () => {
    const fresh = await communityRequest<CatalogItem>({ action: "get", kind: item.kind, id: item.id });
    setSelected(fresh); setImportName(communityItemName(fresh).slice(0, 60));
  });
  const vote = (value: -1 | 0 | 1) => run(async () => {
    if (!selected) return;
    const item = await communityRequest<CatalogItem>({ action: "vote", kind: selected.kind, id: selected.id, value });
    setSelected(item); setItems(current => current.map(old => old.id === item.id ? item : old));
    setMessage(value === 0 ? "Your vote was removed." : value === 1 ? "Your upvote was saved." : "Your downvote was saved.");
  });
  const importSelected = () => run(async () => {
    if (!selected) return;
    if (selected.kind === "options") {
      const result = await communityRequest<{ alreadyImported: boolean }>({ action: "importOption", kind: "options", id: selected.id });
      await onOptionsImported();
      setMessage(result.alreadyImported ? "This option is already in your local catalog." : "Option added to your local catalog. You can now select it in a preset.");
    } else {
      const item = await communityRequest<CatalogItem>({ action: "get", kind: "presets", id: selected.id });
      onPresetImported(importName.trim(), item.data);
    }
  });
  const option = options.find(item => item.id === localOptionId);
  const optionJson = option ? Object.fromEntries(Object.entries(option.source).filter(([key]) => key !== "id" && key !== "readOnly")) : null;
  const shareJson = shareKind === "presets" ? preview : optionJson;
  const shareKey = JSON.stringify([endpoint, shareKind, shareKind === "presets" ? buildToken : optionJson]);
  const canShare = Boolean(account?.signedIn && shareJson && (shareKind === "options" || buildToken) && submittedKey !== shareKey);
  const share = () => run(async () => {
    if (!canShare) return;
    const item = await communityRequest<CatalogItem>(shareKind === "presets"
      ? { action: "sharePreset", buildToken: buildToken! }
      : { action: "shareOption", localId: option!.source.id });
    setSubmittedKey(shareKey);
    setMessage(`Shared “${communityItemName(item)}” with the community. Catalog ID: ${item.id}`);
  });
  const close = () => { if (!pending.current) onClose(); };
  const visible = items.filter(item => communityItemName(item).toLowerCase().includes(search.toLowerCase()));

  return <dialog className="preset-dialog community-dialog" ref={dialogRef} aria-labelledby="communityTitle" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="preset-dialog-card">
      <button className="dialog-close" type="button" aria-label="Close community" disabled={busy} onClick={close}><Icon name="close" /></button>
      <span className="step-label">SOTN Preset API</span><h2 id="communityTitle">Community</h2>
      <p>Discover presets and options, share your creations, and vote on community submissions.</p>
      <nav className="community-tabs" aria-label="Community sections">
        {([ ["presets", "Presets"], ["options", "Options"], ["share", "Share"], ["account", account?.signedIn ? "Account" : "Sign in"] ] as [Tab, string][]).map(([value, label]) =>
          <button type="button" key={value} className={`button ${tab === value ? "button-primary" : "button-ghost"}`} aria-current={tab === value ? "page" : undefined} disabled={busy} onClick={() => { setTab(value); setMessage(""); setError(""); }}>{label}</button>)}
      </nav>
      {error && <p className="community-error" role="alert">{error}</p>}
      {message && <p className="community-message" role="status">{message}</p>}
      {busy && <p className="community-hint" role="status">Working…</p>}
      {!account && !error && <p>Loading community settings…</p>}
      {account && (tab === "options" || tab === "presets") && <>
        <div className="community-toolbar">
          <input id="communitySearch" aria-label={`Search loaded ${tab}`} placeholder={`Search loaded ${tab}…`} value={search} onChange={event => setSearch(event.target.value)} />
          <button className="button button-ghost" disabled={busy} onClick={() => refresh(false)}>Refresh</button>
        </div>
        <div className="community-browser">
          <div className="community-list" aria-label={`Community ${tab}`}>
            {visible.map(item => <button type="button" key={item.id} className={`community-item ${selected?.id === item.id ? "is-selected" : ""}`} disabled={busy} onClick={() => view(item)}>
              <strong>{communityItemName(item)}</strong><span>Score {item.score} · {item.upvotes} up · {item.downvotes} down</span>
            </button>)}
            {loaded && !busy && visible.length === 0 && <p>{items.length ? "No matches in the loaded items." : cursor ? "This page has no items. Load more to continue." : "No community items yet."}</p>}
            {cursor && <button className="button button-ghost" disabled={busy} onClick={() => refresh(true)}>Load more</button>}
          </div>
          <section className="community-detail" aria-label="Selected community item">
            {selected ? <>
              <h3>{communityItemName(selected)}</h3>
              <p className="community-hint">Submitted {new Date(selected.createdAt).toLocaleDateString()} · Score {selected.score}</p>
              <details><summary>Submission details</summary><p className="community-hint">Catalog ID: {selected.id}<br />Submitted by: {selected.createdBy}</p></details>
              <div className="community-votes">
                <button className="button button-ghost" disabled={busy || !account.signedIn} onClick={() => vote(1)}>Upvote ({selected.upvotes})</button>
                <button className="button button-ghost" disabled={busy || !account.signedIn} onClick={() => vote(-1)}>Downvote ({selected.downvotes})</button>
                <button className="button button-ghost" disabled={busy || !account.signedIn} onClick={() => vote(0)}>Remove my vote</button>
              </div>
              {!account.signedIn && <p className="community-hint">Sign in to vote. Importing is available without an account.</p>}
              <pre className="community-json" aria-label="Community item JSON">{JSON.stringify(selected.data, null, 2)}</pre>
              {selected.kind === "presets" && <>
                <p className="community-hint">Using a template creates an editable local copy. The editor replaces location rules with its own and does not resolve inherited presets. Review the resulting JSON before exporting.</p>
                <label htmlFor="communityPresetName">Local preset name</label><input id="communityPresetName" maxLength={60} value={importName} onChange={event => setImportName(event.target.value)} />
              </>}
              <div className="dialog-actions"><button className="button button-ghost" disabled={busy} onClick={() => run(async () => { await navigator.clipboard.writeText(JSON.stringify(selected.data, null, 2)); setMessage("Copied JSON."); })}>Copy JSON</button>
                <button className="button button-primary" disabled={busy || (selected.kind === "presets" && !importName.trim())} onClick={importSelected}>{selected.kind === "options" ? "Add to my options" : "Use as template"}</button></div>
            </> : <p>Select an item to inspect its JSON, import it, or vote.</p>}
          </section>
        </div>
      </>}
      {account && tab === "share" && <section className="community-share">
        <h3>Share with the community</h3>
        <p>Your submission will be public. Review the JSON below before sharing. Each submission creates a new catalog entry.</p>
        {!account.signedIn && <p className="community-hint">Sign in to submit an option or preset.</p>}
        <label htmlFor="communityShareKind">What would you like to share?</label>
        <select id="communityShareKind" disabled={busy} value={shareKind} onChange={event => setShareKind(event.target.value as CatalogKind)}><option value="presets">Current exported preset</option><option value="options">A local option</option></select>
        {shareKind === "presets" ? <><p><strong>{presetName || "No preset open"}</strong></p>{!buildToken && <p className="community-hint">Open a preset and export and build its current changes before sharing.</p>}</> : <>
          <label htmlFor="communityLocalOption">Local option</label><select id="communityLocalOption" disabled={busy} value={localOptionId} onChange={event => setLocalOptionId(event.target.value)}><option value="">Choose an option…</option>{options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        </>}
        {shareJson && <pre className="community-json" aria-label="Submission JSON">{JSON.stringify(shareJson, null, 2)}</pre>}
        <div className="dialog-actions"><button className="button button-primary" disabled={busy || !canShare} onClick={share}>{submittedKey === shareKey ? "Shared" : "Share publicly"}</button></div>
      </section>}
      {account && tab === "account" && <CommunityAccount key={JSON.stringify(account.config)} account={account} busy={busy} run={run} onAccount={(next, status) => { setAccount(next); setMessage(status); }} />}
    </div>
  </dialog>;
}
