import type { CommunityRequest } from "../community-types";

export async function communityRequest<T>(request: CommunityRequest): Promise<T> {
  const result = await window.presetApp.community(request);
  if (result.status === "error") throw new Error(result.error);
  return result.data as T;
}
