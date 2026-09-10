import type { EventEmitter } from "node:events";
import type { UpdateRelease, UpdateState } from "./update-types";

export const RELEASE_REPOSITORY = "ndsmith201/SOTNPresetGenerator";
const repositoryUrl = `https://github.com/${RELEASE_REPOSITORY}`;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isNewerStableVersion(candidate: string, current: string): boolean {
  if (!stableVersion.test(candidate)) return false;
  const currentMatch = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(current);
  if (!currentMatch) return false;
  const next = candidate.split(".").map(Number);
  const installed = currentMatch.slice(1, 4).map(Number);
  if (![...next, ...installed].every(Number.isSafeInteger)) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return Boolean(currentMatch[4]);
}

export function selectUpdate(value: unknown, currentVersion: string, arch: string, squirrelInstalled: boolean): UpdateRelease | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Record<string, unknown>;
  if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string" || !Array.isArray(release.assets)) return null;
  const version = release.tag_name.replace(/^v/, "");
  if (!isNewerStableVersion(version, currentVersion)) return null;
  const assets = new Set(release.assets.flatMap(asset => asset && typeof asset === "object" && typeof asset.name === "string" ? [asset.name] : []));
  // The current release workflow publishes one Windows architecture per release.
  if (!assets.has(`SOTNPresetGenerator-${version}-win32-${arch}-Setup.exe`)) return null;
  const hasFeed = assets.has("RELEASES") && assets.has(`SOTNPresetGenerator-${version}-full.nupkg`);
  const tag = encodeURIComponent(release.tag_name);
  return { version, pageUrl: `${repositoryUrl}/releases/tag/${tag}`, feedUrl: `${repositoryUrl}/releases/download/${tag}`, automatic: squirrelInstalled && hasFeed };
}

interface NativeUpdater extends EventEmitter {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
}

interface UpdaterOptions {
  currentVersion: string;
  enabled: boolean;
  arch: string;
  squirrelInstalled: boolean;
  updater: NativeUpdater;
  fetcher?: typeof fetch;
  onState: (state: UpdateState) => void;
  log?: (error: unknown) => void;
}

export class AppUpdater {
  private state: UpdateState;
  private checked = false;
  constructor(private options: UpdaterOptions) {
    this.state = { phase: "idle", currentVersion: options.currentVersion };
    options.updater.on("error", error => {
      if (["downloading", "restarting"].includes(this.state.phase)) this.fail(error);
    });
    options.updater.on("update-not-available", () => {
      if (this.state.phase === "downloading") this.fail(new Error("This update is no longer available. Try again on the next startup."));
    });
    options.updater.on("update-downloaded", () => {
      if (this.state.phase === "downloading") this.setState({ ...this.state, phase: "ready" });
    });
  }

  getState(): UpdateState { return structuredClone(this.state); }
  private setState(state: UpdateState): void { this.state = state; this.options.onState(this.getState()); }
  private fail(error: unknown): void {
    this.options.log?.(error);
    this.setState({ ...this.state, phase: "error", error: error instanceof Error ? error.message : "Unable to install the update." });
  }

  async check(): Promise<void> {
    if (!this.options.enabled || this.checked) return;
    this.checked = true;
    this.setState({ phase: "checking", currentVersion: this.options.currentVersion });
    try {
      const response = await (this.options.fetcher ?? fetch)(`https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "SOTNPresetGenerator", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(15_000), redirect: "error"
      });
      if (!response.ok) throw new Error(`Release check returned HTTP ${response.status}.`);
      if (Number(response.headers.get("content-length")) > 1_048_576) throw new Error("Release metadata is too large.");
      // Bound streamed metadata as well as responses that send Content-Length.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Release metadata is empty.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1_048_576) throw new Error("Release metadata is too large.");
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel(); }
      const release = selectUpdate(JSON.parse(Buffer.concat(chunks).toString("utf8")), this.options.currentVersion, this.options.arch, this.options.squirrelInstalled);
      this.setState({ phase: release ? "available" : "idle", currentVersion: this.options.currentVersion, ...(release ? { release } : {}) });
    } catch (error) {
      // Offline/rate-limited startup must not interrupt local preset editing.
      this.options.log?.(error);
      this.setState({ phase: "idle", currentVersion: this.options.currentVersion });
    }
  }

  install(): void {
    if (!["available", "error"].includes(this.state.phase) || !this.state.release?.automatic) throw new Error("No automatic update is available.");
    this.setState({ ...this.state, phase: "downloading", error: undefined });
    try {
      // Pin the feed to the release the user approved; Squirrel reads RELEASES
      // and verifies the package before staging it alongside the current app.
      this.options.updater.setFeedURL({ url: this.state.release!.feedUrl });
      this.options.updater.checkForUpdates();
    } catch (error) { this.fail(error); }
  }

  restart(): void {
    if (this.state.phase !== "ready") throw new Error("The update has not finished downloading.");
    this.setState({ ...this.state, phase: "restarting" });
    try { this.options.updater.quitAndInstall(); }
    catch (error) { this.fail(error); }
  }
}
