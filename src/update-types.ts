export interface UpdateRelease {
  version: string;
  pageUrl: string;
  feedUrl: string;
  automatic: boolean;
  notes: string;
}

export interface UpdateState {
  phase: "idle" | "checking" | "available" | "downloading" | "ready" | "restarting" | "error";
  currentVersion: string;
  release?: UpdateRelease;
  error?: string;
}

export type UpdateResult = { status: "ok" } | { status: "error"; error: string };

export interface UpdateApi {
  getState: () => Promise<UpdateState>;
  onState: (listener: (state: UpdateState) => void) => () => void;
  install: () => Promise<UpdateResult>;
  restart: () => Promise<UpdateResult>;
  openDownload: () => Promise<UpdateResult>;
}
