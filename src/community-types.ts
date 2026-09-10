export type CatalogKind = "options" | "presets";
export interface CommunityConfig {
  apiUrl: string;
  region: string;
  clientId: string;
  devUser: string;
}
export interface CommunityStatus {
  config: CommunityConfig;
  signedIn: boolean;
  email: string;
  remembered: boolean;
}
export interface CatalogItem {
  id: string;
  kind: CatalogKind;
  createdBy: string;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  score: number;
  data: Record<string, unknown>;
}
export interface CatalogPage { items: CatalogItem[]; nextCursor?: string }
export type AccountAction = "signIn" | "signUp" | "confirm" | "resend" | "forgot" | "reset" | "signOut";
export interface AccountRequest { action: AccountAction; email?: string; password?: string; code?: string }
export type CommunityRequest =
  | { action: "status" }
  | { action: "configure"; config: CommunityConfig }
  | { action: "account"; account: AccountRequest }
  | { action: "health" }
  | { action: "list"; kind: CatalogKind; cursor?: string }
  | { action: "get" | "importOption"; kind: CatalogKind; id: string }
  | { action: "vote"; kind: CatalogKind; id: string; value: -1 | 0 | 1 }
  | { action: "shareOption"; localId: number }
  | { action: "sharePreset"; buildToken: string };
export type CommunityResult<T = unknown> = { status: "ok"; data: T } | { status: "error"; error: string };
