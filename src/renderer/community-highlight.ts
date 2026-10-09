import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityFeaturedMod, CommunityStatus } from "../community-types";
import { communityRequest, subscribeCommunityStatus } from "./community-api";

export interface CommunityHighlight {
  title: string;
  description: string;
  imageUrl: string;
}

// Keep the banner useful before a featured mod is published or while the API is unavailable.
export const COMMUNITY_HIGHLIGHT_PLACEHOLDER: CommunityHighlight = {
  title: "A new challenge.\nYour kind of run.",
  description: "Discover a community-made mod for your next castle run.",
  imageUrl: "../../assets/icons/castle-moon.png"
};

const MAX_RELEASE_TIMER_MS = 2 ** 31 - 1;
// Share the initial request across Strict Mode effects and library remounts.
// The main process also caches it across renderer reloads for this app session.
const sessionHighlights = new Map<string | undefined, Promise<CommunityFeaturedMod | null>>();
function loadHighlight(apiUrl?: string): Promise<CommunityFeaturedMod | null> {
  let metadata = sessionHighlights.get(apiUrl);
  if (!metadata) {
    metadata = communityRequest<CommunityFeaturedMod | null>({ action: "featuredMod", apiUrl }).catch(() => null);
    sessionHighlights.set(apiUrl, metadata);
  }
  return metadata;
}

function canDownload(mod: CommunityFeaturedMod | null, now = Date.now()): boolean {
  return Boolean(mod && (mod.downloadAvailable || Date.parse(mod.releaseTime) <= now));
}

export function useCommunityHighlight() {
  const [featuredMod, setFeaturedMod] = useState<CommunityFeaturedMod | null>(null);
  const [releaseClock, setReleaseClock] = useState(Date.now);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const featuredModRef = useRef<CommunityFeaturedMod | null>(null);
  const apiUrl = useRef<string | undefined>(undefined);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const requestVersion = useRef(0);
  const downloadPending = useRef(false);
  const selectionVersion = useRef(0);

  const updateFeaturedMod = useCallback((mod: CommunityFeaturedMod | null) => {
    if (featuredModRef.current?.id !== mod?.id) {
      selectionVersion.current++;
      setDownloadError("");
      setDownloadMessage("");
    }
    featuredModRef.current = mod;
    setFeaturedMod(mod);
  }, []);

  const load = useCallback(async (nextApiUrl?: string) => {
    const current = ++requestVersion.current;
    const mod = await loadHighlight(nextApiUrl);
    if (mounted.current && current === requestVersion.current) updateFeaturedMod(mod);
  }, [updateFeaturedMod]);

  useEffect(() => {
    mounted.current = true;
    const currentLifecycle = ++lifecycle.current;
    const selectApi = (nextApiUrl: string) => {
      if (!mounted.current || currentLifecycle !== lifecycle.current || apiUrl.current === nextApiUrl) return;
      apiUrl.current = nextApiUrl;
      selectionVersion.current++;
      updateFeaturedMod(null);
      void load(nextApiUrl);
    };
    const unsubscribe = subscribeCommunityStatus(status => selectApi(status.config.apiUrl));
    void communityRequest<CommunityStatus>({ action: "status" }).then(status => {
      selectApi(status.config.apiUrl);
    }).catch(() => {
      if (mounted.current && currentLifecycle === lifecycle.current && apiUrl.current === undefined) void load();
    });
    return () => {
      mounted.current = false;
      requestVersion.current++;
      apiUrl.current = undefined;
      unsubscribe();
    };
  }, [load, updateFeaturedMod]);

  useEffect(() => {
    let timer: number | undefined;
    const checkRelease = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setReleaseClock(now);
      if (canDownload(featuredMod, now)) return;
      const release = featuredMod ? Date.parse(featuredMod.releaseTime) : NaN;
      if (!Number.isFinite(release)) return;
      // This changes only the button. The download endpoint checks server time
      // on every request and can still refuse an early client clock.
      timer = window.setTimeout(checkRelease, Math.min(Math.max(1, release - now), MAX_RELEASE_TIMER_MS));
    };
    checkRelease();
    window.addEventListener("focus", checkRelease);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkRelease);
    };
  }, [featuredMod]);

  const download = useCallback(async () => {
    const mod = featuredModRef.current;
    if (!mounted.current || !mod || !canDownload(mod) || downloadPending.current) return;
    const currentLifecycle = lifecycle.current;
    const currentSelection = selectionVersion.current;
    downloadPending.current = true;
    setDownloading(true);
    setDownloadError("");
    setDownloadMessage("");
    try {
      const result = await communityRequest<{ canceled: boolean; filePath?: string }>({ action: "downloadFeaturedMod", id: mod.id, title: mod.title });
      if (!mounted.current || currentLifecycle !== lifecycle.current || currentSelection !== selectionVersion.current || result.canceled) return;
      const fileName = result.filePath?.split(/[\\/]/).pop();
      setDownloadMessage(`Saved ${fileName || `${mod.title}.ppf`}`);
    } catch (cause) {
      if (mounted.current && currentLifecycle === lifecycle.current && currentSelection === selectionVersion.current) {
        setDownloadError(cause instanceof Error ? cause.message : "Unable to download the featured mod.");
      }
    } finally {
      downloadPending.current = false;
      if (mounted.current && currentLifecycle === lifecycle.current) setDownloading(false);
    }
  }, []);

  const release = featuredMod ? Date.parse(featuredMod.releaseTime) : NaN;
  const downloadNote = Number.isFinite(release) && release > Date.now()
    ? `Available ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(release))}`
    : "Download coming soon";

  return {
    highlight: featuredMod ? { title: featuredMod.title, description: featuredMod.description, imageUrl: featuredMod.image } : COMMUNITY_HIGHLIGHT_PLACEHOLDER,
    downloadAvailable: canDownload(featuredMod, releaseClock),
    downloading,
    downloadError,
    downloadMessage,
    downloadNote,
    onDownload: () => { void download(); }
  };
}

export type CommunityHighlightState = ReturnType<typeof useCommunityHighlight>;
