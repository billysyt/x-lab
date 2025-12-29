import { NextResponse, type NextRequest } from "next/server";
import projectUpdates from "@/data/project-updates.json";

type ReleaseEntry = {
  version: string;
  released_at?: string | null;
  download_url?: string | null;
  notes?: string | null;
  force_update?: boolean;
  min_supported?: string | null;
};

type ProjectCatalog = Record<string, ReleaseEntry[]>;

const catalog = projectUpdates as ProjectCatalog;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function compareVersions(a: string, b: string) {
  const left = normalizeVersion(a).split(/[^0-9]+/).filter(Boolean).map(Number);
  const right = normalizeVersion(b).split(/[^0-9]+/).filter(Boolean).map(Number);
  const maxLen = Math.max(left.length, right.length);
  for (let i = 0; i < maxLen; i += 1) {
    const la = left[i] ?? 0;
    const lb = right[i] ?? 0;
    if (la > lb) return 1;
    if (la < lb) return -1;
  }
  return 0;
}

function pickLatest(entries: ReleaseEntry[]) {
  if (entries.length <= 1) return entries[0] ?? null;
  const sorted = [...entries].sort((a, b) => compareVersions(b.version, a.version));
  return sorted[0] ?? null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project");
  if (!project) {
    return NextResponse.json({ error: "Missing project parameter." }, { status: 400, headers: CORS_HEADERS });
  }

  const releases = catalog[project];
  if (!releases || releases.length === 0) {
    return NextResponse.json({ error: "Unknown project." }, { status: 404, headers: CORS_HEADERS });
  }

  const latest = pickLatest(releases);
  if (!latest) {
    return NextResponse.json({ error: "No releases found." }, { status: 404, headers: CORS_HEADERS });
  }

  const currentVersion = searchParams.get("current") ?? searchParams.get("version");
  const latestVersion = latest.version;
  const minSupportedVersion = latest.min_supported ?? null;
  const updateAvailable = currentVersion
    ? compareVersions(latestVersion, currentVersion) > 0
    : null;
  const forceUpdate = Boolean(latest.force_update) ||
    (currentVersion && minSupportedVersion
      ? compareVersions(currentVersion, minSupportedVersion) < 0
      : false);

  const response = NextResponse.json({
    project,
    currentVersion: currentVersion ?? null,
    latestVersion,
    updateAvailable,
    forceUpdate,
    minSupportedVersion,
    downloadUrl: latest.download_url ?? null,
    releaseNotes: latest.notes ?? null,
    publishedAt: latest.released_at ?? null,
    releases
  });
  response.headers.set("Cache-Control", "no-store");
  Object.entries(CORS_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
