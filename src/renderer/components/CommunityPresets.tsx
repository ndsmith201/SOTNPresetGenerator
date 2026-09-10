import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItem, CatalogKind, CatalogPage } from "../../community-types";
import { communityRequest } from "../community-api";
import { formatUpdatedDate } from "../preset-utils";
import { Icon } from "./Icon";

export function communityItemName(item: CatalogItem): string {
  const metadata = item.data.metadata as Record<string, unknown> | undefined;
  return String(item.kind === "options" ? item.data.comment || "Untitled option" : metadata?.name || "Untitled preset");
}

export function CommunityPresets({ kind = "presets", onOpen }: { kind?: CatalogKind; onOpen: (item: CatalogItem) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const pending = useRef(false);
  const version = useRef(0);
  const load = useCallback(async (next?: string) => {
    if (pending.current) return;
    const current = ++version.current;
    pending.current = true; setBusy(true); setError("");
    try {
      const page = await communityRequest<CatalogPage>({ action: "list", kind, cursor: next });
      if (current !== version.current) return;
      if (next && next === page.nextCursor) throw new Error("Unable to load the next page. Refresh to try again.");
      setItems(old => next ? [...new Map([...old, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.nextCursor);
    } catch (cause) { if (current === version.current) setError(cause instanceof Error ? cause.message : "Unable to load community presets."); }
    finally { if (current === version.current) { pending.current = false; setBusy(false); } }
  }, [kind]);
  useEffect(() => { void load(); return () => { version.current++; pending.current = false; }; }, [load]);
  const visible = items.filter(item => communityItemName(item).toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="installed-presets" aria-labelledby={`community-${kind}-title`}>
    <div className="library-heading"><div><span className="step-label">Made by the community</span><h2 id={`community-${kind}-title`}>Community {kind}</h2><p>{kind === "presets" ? "Explore shared presets and find your next run." : "Add community creations to your option catalog."}</p></div><button className="button button-ghost" disabled={busy} onClick={() => void load()}>Refresh</button></div>
    <label className="search-box community-search"><Icon name="search" /><input type="search" aria-label={`Search loaded community ${kind}`} placeholder={`Search community ${kind}…`} value={search} onChange={event => setSearch(event.target.value)} /></label>
    {error && <p className="community-error" role="alert">{error}</p>}
    {busy && <p className="installed-status" role="status">Loading community {kind}…</p>}
    {!busy && !error && !visible.length && <p className="installed-status">{items.length ? "No matches in the loaded items." : cursor ? "Load more to continue browsing." : `No community ${kind} yet.`}</p>}
    <div className="preset-grid">
      {visible.map(item => {
        const metadata = item.data.metadata as Record<string, unknown> | undefined;
        return <div className="preset-card-container" key={item.id}>
          <button className="preset-card" type="button" aria-label={`View community ${kind === "presets" ? "preset" : "option"} ${communityItemName(item)}`} onClick={() => onOpen(item)}>
            <span className="preset-card-top"><span className="preset-card-icon"><Icon name="diamond" /></span><span className="preset-option-count">Community</span></span>
            <strong className="preset-card-name">{communityItemName(item)}</strong>
            <span className="preset-summary">{String(metadata?.description || item.data.description || "Shared with the community")}</span>
            <span className="preset-card-footer"><span>{formatUpdatedDate(item.createdAt)}</span><span className="preset-card-arrow">View <Icon name="arrow" /></span></span>
          </button>
          <span className="preset-community-score" aria-label={`${item.upvotes} upvotes`} title={`${item.upvotes} upvotes`}><Icon name="heart" />{item.upvotes}</span>
        </div>;
      })}
    </div>
    {cursor && <button className="button button-ghost community-load-more" disabled={busy} onClick={() => void load(cursor)}>Load more</button>}
  </section>;
}
