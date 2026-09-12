import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { CommunityAuth, type CommunityStorage } from "./community-auth";
import { CommunityClient, CommunityHttpError, isRecord } from "./community-client";
import { optionSubmission } from "./community-options";
import type { CommunityRequest, CommunityResult } from "./community-types";
import type { BuiltPresetStore } from "./preset-generation";

interface LocalOption { id: number; [key: string]: unknown }
interface Dependencies {
  database: DatabaseSync;
  storage: CommunityStorage;
  builds: BuiltPresetStore;
  createOption: (data: unknown) => LocalOption;
  loadOption: (id: number) => LocalOption;
  fetcher?: typeof fetch;
}

export class CommunityService {
  readonly auth: CommunityAuth;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private deps: Dependencies) {
    this.auth = new CommunityAuth(deps.storage, deps.fetcher);
    deps.database.exec(`CREATE TABLE IF NOT EXISTS community_option_imports (
      api_url TEXT NOT NULL, catalog_id TEXT NOT NULL, local_id INTEGER NOT NULL,
      PRIMARY KEY (api_url, catalog_id)
    )`);
  }
  // Serialize account/config changes with requests, and prevent simultaneous imports
  // from creating duplicate local IDs. Failures must not poison the queue.
  request(request: CommunityRequest): Promise<CommunityResult> {
    const result = this.pending.then(async (): Promise<CommunityResult> => {
      try { return { status: "ok", data: await this.perform(request) }; }
      catch (error) {
        if (error instanceof CommunityHttpError && error.status === 401) {
          this.auth.invalidateSession();
          return { status: "error", error: "Your community session was rejected. Sign in again." };
        }
        return { status: "error", error: error instanceof Error ? error.message : "Community operation failed." };
      }
    });
    this.pending = result;
    return result;
  }
  private async perform(request: CommunityRequest): Promise<unknown> {
    if (!isRecord(request)) throw new Error("Invalid community request.");
    const { database, builds } = this.deps;
    const client = new CommunityClient(this.auth.config, () => this.auth.accessToken(), this.deps.fetcher);
    switch (request.action) {
      case "status": return this.auth.status();
      case "configure": return this.auth.configure(request.config);
      case "account": return this.auth.account(request.account);
      case "health": await client.health(); return { message: "Community service is reachable." };
      case "list": return client.list(request.kind, request.cursor);
      case "get": return client.get(request.kind, request.id);
      case "vote": return client.vote(request.kind, request.id, request.value);
      case "shareOption": {
        if (!Number.isSafeInteger(request.localId) || request.localId < 1) throw new Error("Select a local option to share.");
        const option = this.deps.loadOption(request.localId);
        return client.create("options", JSON.stringify(optionSubmission(option)));
      }
      case "sharePreset": {
        const build = await builds.resolve(request.buildToken);
        const json = await readFile(path.join(build.rootPath, "presets", `${build.presetId}.json`), "utf8");
        if (createHash("sha256").update(json).digest("hex") !== build.jsonHash) throw new Error("The exported preset changed. Export and build it again before sharing.");
        return client.create("presets", json);
      }
      case "importOption": {
        if (request.kind !== "options") throw new Error("Only options can be imported into the option catalog.");
        const item = await client.get("options", request.id);
        const existing = database.prepare("SELECT local_id FROM community_option_imports WHERE api_url = ? AND catalog_id = ?").get(this.auth.config.apiUrl, item.id);
        if (existing) {
          try { return { option: this.deps.loadOption(Number(existing.local_id)), alreadyImported: true }; }
          catch { /* A removed local option can be imported again. */ }
        }
        database.exec("SAVEPOINT community_import");
        try {
          const option = this.deps.createOption(item.data);
          database.prepare("INSERT OR REPLACE INTO community_option_imports (api_url, catalog_id, local_id) VALUES (?, ?, ?)").run(this.auth.config.apiUrl, item.id, option.id);
          database.exec("RELEASE community_import");
          return { option, alreadyImported: false };
        } catch (error) {
          database.exec("ROLLBACK TO community_import");
          database.exec("RELEASE community_import");
          throw error;
        }
      }
      default: throw new Error("Unknown community operation.");
    }
  }
}
