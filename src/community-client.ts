import type { CatalogItem, CatalogKind, CatalogPage, CommunityConfig } from "./community-types";

// Public deployment settings from SOTNPresetAPI/bruno/api/environments/AWS.bru.
export const DEFAULT_COMMUNITY_CONFIG: CommunityConfig = {
  apiUrl: "https://chqxef1xt0.execute-api.us-east-1.amazonaws.com",
  region: "us-east-1",
  clientId: "1885urrsih4lpstjgbujvsei2n",
  devUser: ""
};
export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export function isLoopback(url: URL): boolean { return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname); }
export function validateConfig(value: unknown): CommunityConfig {
  if (!isRecord(value) || !["apiUrl", "region", "clientId", "devUser"].every(key => typeof value[key] === "string")) throw new Error("Invalid community settings.");
  const url = new URL(value.apiUrl as string);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url)))) throw new Error("Use an HTTPS API URL, or HTTP on localhost for development.");
  const region = (value.region as string).trim();
  const clientId = (value.clientId as string).trim();
  const devUser = (value.devUser as string).trim();
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region) || !/^[a-zA-Z0-9]{1,128}$/.test(clientId)) throw new Error("Enter a valid Cognito region and app client ID.");
  if (devUser && (!isLoopback(url) || devUser.length > 200 || /[\r\n]/.test(devUser))) throw new Error("A development identity can only be used with a localhost API.");
  return { apiUrl: url.href.replace(/\/+$/, ""), region, clientId, devUser };
}
export function validateKind(value: unknown): CatalogKind {
  if (value !== "options" && value !== "presets") throw new Error("Unknown community collection.");
  return value;
}
export function validateCatalogId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/.test(value)) throw new Error("Invalid community item ID.");
  return value;
}
export function validateItem(value: unknown, kind: CatalogKind): CatalogItem {
  if (!isRecord(value) || value.kind !== kind || typeof value.createdBy !== "string" || typeof value.createdAt !== "string" || !isRecord(value.data) ||
      ![value.upvotes, value.downvotes, value.score].every(Number.isSafeInteger) || Number(value.upvotes) < 0 || Number(value.downvotes) < 0) throw new Error("The community API returned an invalid item.");
  validateCatalogId(value.id);
  if (kind === "presets" && (!isRecord(value.data.metadata) || typeof value.data.metadata.name !== "string" || typeof value.data.metadata.id !== "string")) throw new Error("The community preset has invalid metadata.");
  if (kind === "options" && (typeof value.data.comment !== "string" || typeof value.data.value !== "string")) throw new Error("The community option is invalid.");
  return value as unknown as CatalogItem;
}

export class CommunityHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requestJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
  // Bound streamed bodies as well as Content-Length: pages can contain 50 large presets.
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("The community response is too large."); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
  }
  let result: unknown;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"), (_key, value: unknown) => {
      if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error("Unsafe number");
      return value;
    });
  } catch {
    if (response.ok) throw new Error("The community API returned invalid JSON or unsupported numeric precision.");
  }
  if (!response.ok) {
    const detail = isRecord(result) ? (isRecord(result.error) ? result.error.message : result.message) : undefined;
    const fallback = response.status === 401 ? "Sign in again to share or vote." : response.status === 429 ? "Too many requests. Try again shortly." : `Community request failed (${response.status}).`;
    throw new CommunityHttpError(response.status, typeof detail === "string" ? detail.slice(0, 1000) : fallback);
  }
  return result;
}

export class CommunityClient {
  constructor(private config: CommunityConfig, private accessToken: () => Promise<string>, private fetcher: typeof fetch = fetch) {}
  private async request(route: string, method = "GET", body?: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (method !== "GET") {
      if (body && Buffer.byteLength(body, "utf8") > 131072) throw new Error("Community submissions must be 128 KiB or smaller.");
      headers["Content-Type"] = "application/json";
      if (this.config.devUser && isLoopback(new URL(this.config.apiUrl))) headers["X-Dev-User"] = this.config.devUser;
      else headers.Authorization = `Bearer ${await this.accessToken()}`;
    }
    try { return await requestJson(this.fetcher, `${this.config.apiUrl}${route}`, { method, headers, body }); }
    catch (error) {
      if (error instanceof CommunityHttpError) throw error;
      // POSTs are deliberately never retried: the API has no deduplication key.
      throw new Error(method === "POST" ? "The submission result could not be confirmed. Refresh the catalog before submitting again to avoid a duplicate." : "Unable to reach the community service. Check your connection and settings.");
    }
  }
  async health(): Promise<void> {
    const result = await this.request("/healthz");
    if (!isRecord(result) || result.status !== "ok") throw new Error("The community service did not report healthy status.");
  }
  async list(kind: CatalogKind, cursor?: string): Promise<CatalogPage> {
    validateKind(kind);
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 16384)) throw new Error("Invalid page cursor.");
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);
    const result = await this.request(`/v1/${kind}?${query}`);
    if (!isRecord(result) || !Array.isArray(result.items) || (result.nextCursor !== undefined && typeof result.nextCursor !== "string")) throw new Error("The community API returned an invalid page.");
    return { items: result.items.map(item => validateItem(item, kind)), nextCursor: result.nextCursor as string | undefined };
  }
  async get(kind: CatalogKind, id: string): Promise<CatalogItem> {
    return validateItem(await this.request(`/v1/${validateKind(kind)}/${validateCatalogId(id)}`), kind);
  }
  async create(kind: CatalogKind, json: string): Promise<CatalogItem> {
    try {
      return validateItem(await this.request(`/v1/${validateKind(kind)}`, "POST", json), kind);
    } catch (error) {
      if (error instanceof CommunityHttpError && error.status === 403) {
        const subject = kind === "presets" ? "a preset" : "an option";
        throw new CommunityHttpError(403, `There is already ${subject} with that name and you are not the author. Please choose a new name.`);
      }
      throw error;
    }
  }
  async vote(kind: CatalogKind, id: string, value: number): Promise<CatalogItem> {
    if (![-1, 0, 1].includes(value)) throw new Error("Choose upvote, downvote, or remove vote.");
    return validateItem(await this.request(`/v1/${validateKind(kind)}/${validateCatalogId(id)}/vote`, "PUT", JSON.stringify({ value })), kind);
  }
}
