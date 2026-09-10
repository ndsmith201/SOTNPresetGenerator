import type { CommunityRequest, CommunityStatus } from "../community-types";

const statusListeners = new Set<(status: CommunityStatus) => void>();

export function subscribeCommunityStatus(listener: (status: CommunityStatus) => void): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

function publishStatus(status: CommunityStatus): void {
  statusListeners.forEach(listener => listener(status));
}

export async function communityRequest<T>(request: CommunityRequest): Promise<T> {
  const result = await window.presetApp.community(request);
  if (result.status === "error") {
    // Authentication failures can clear the main-process session. Reflect that
    // in the editor while preserving the original operation error.
    if (request.action !== "status") {
      try {
        const status = await window.presetApp.community({ action: "status" });
        if (status.status === "ok") publishStatus(status.data as CommunityStatus);
      } catch { /* Keep the last known account when status is unavailable. */ }
    }
    throw new Error(result.error);
  }
  if (request.action === "status" || request.action === "configure") publishStatus(result.data as CommunityStatus);
  else if (request.action === "account") publishStatus((result.data as { account: CommunityStatus }).account);
  return result.data as T;
}
