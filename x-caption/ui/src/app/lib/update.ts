import { compareVersions } from "./format";

export type UpdateModalInfo = {
  project: string;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  forceUpdate: boolean;
  minSupportedVersion: string | null;
  downloadUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
};

export function buildUpdateModalInfo(
  payload: any,
  fallbackVersion: string | null,
  defaultProject: string
): UpdateModalInfo | null {
  if (!payload || typeof payload !== "object") return null;
  const latestVersion =
    payload.latestVersion ??
    payload.latest_version ??
    payload.latest ??
    payload.version ??
    null;
  if (typeof latestVersion !== "string" || !latestVersion.trim()) return null;
  const currentVersion = fallbackVersion ?? payload.currentVersion ?? payload.current_version ?? null;
  const minSupportedVersion =
    payload.minSupportedVersion ?? payload.min_supported ?? payload.minimum_supported ?? null;
  const updateAvailable =
    typeof currentVersion === "string" && typeof latestVersion === "string"
      ? compareVersions(latestVersion, currentVersion) > 0
      : typeof payload.updateAvailable === "boolean"
        ? payload.updateAvailable
        : null;
  let forceUpdate = Boolean(payload.forceUpdate ?? payload.force_update);
  if (typeof currentVersion === "string" && typeof minSupportedVersion === "string") {
    forceUpdate = forceUpdate || compareVersions(currentVersion, minSupportedVersion) < 0;
  }
  if (!forceUpdate && updateAvailable !== true) {
    return null;
  }
  const downloadUrl = payload.downloadUrl ?? payload.url ?? payload.link ?? payload.download_url ?? null;
  const releaseNotes =
    typeof payload.releaseNotes === "string"
      ? payload.releaseNotes
      : typeof payload.notes === "string"
        ? payload.notes
        : null;
  const publishedAt =
    typeof payload.publishedAt === "string"
      ? payload.publishedAt
      : typeof payload.released_at === "string"
        ? payload.released_at
        : null;

  return {
    project: String(payload.project ?? defaultProject ?? "x-caption"),
    currentVersion: typeof currentVersion === "string" ? currentVersion : null,
    latestVersion,
    updateAvailable,
    forceUpdate,
    minSupportedVersion: typeof minSupportedVersion === "string" ? minSupportedVersion : null,
    downloadUrl: typeof downloadUrl === "string" ? downloadUrl : null,
    releaseNotes,
    publishedAt
  };
}
