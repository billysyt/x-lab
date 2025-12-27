import type {
  ConvertChineseResponse,
  HistoryResponse,
  JobStatusResponse,
  PollResponse,
  PreprocessResponse,
  YoutubeImportStatus,
  YoutubeImportResponse,
  WhisperModelDownload,
  WhisperModelStatus,
  RemoveJobResponse,
  TranscribeResponse
} from "../types";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await readJson<T>(response);
  if (!response.ok) {
    const errorMessage =
      (payload as any)?.error ||
      (payload as any)?.message ||
      `Request failed with status ${response.status}`;
    throw new Error(String(errorMessage));
  }
  return payload;
}

export async function apiGetHistory(): Promise<HistoryResponse> {
  return fetchJson<HistoryResponse>("/history");
}

export async function apiGetJob(jobId: string): Promise<JobStatusResponse> {
  return fetchJson<JobStatusResponse>(`/job/${jobId}`);
}

export async function apiPollJob(jobId: string): Promise<PollResponse> {
  return fetchJson<PollResponse>(`/job/${jobId}/poll`);
}

export async function apiPreprocessAudio(file: File): Promise<PreprocessResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return fetchJson<PreprocessResponse>("/preprocess_audio", { method: "POST", body: formData });
}

export async function apiGetWhisperModelStatus(): Promise<WhisperModelStatus> {
  return fetchJson<WhisperModelStatus>("/models/whisper/status");
}

export async function apiStartWhisperModelDownload(): Promise<WhisperModelDownload> {
  return fetchJson<WhisperModelDownload>("/models/whisper/download", { method: "POST" });
}

export async function apiGetWhisperModelDownload(downloadId: string): Promise<WhisperModelDownload> {
  return fetchJson<WhisperModelDownload>(`/models/whisper/download/${downloadId}`);
}

export async function apiTranscribeAudio(args: {
  jobId?: string | null;
  file?: File;
  filePath?: string | null;
  filename?: string | null;
  displayName?: string | null;
  mediaKind?: "audio" | "video" | null;
  model: string;
  language: string;
  noiseSuppression: boolean;
  chineseStyle?: "spoken" | "written";
  chineseScript?: "traditional" | "simplified";
}): Promise<TranscribeResponse> {
  const formData = new FormData();
  if (args.jobId) {
    formData.append("job_id", args.jobId);
  }
  if (args.file) {
    formData.append("file", args.file);
  }
  if (args.filePath) {
    formData.append("file_path", args.filePath);
  }
  if (args.filename) {
    formData.append("filename", args.filename);
  }
  if (args.mediaKind) {
    formData.append("media_kind", args.mediaKind);
  }
  if (args.displayName) {
    formData.append("display_name", args.displayName);
  }
  formData.append("model", args.model || "whisper");
  formData.append("language", args.language);
  formData.append("device", "auto");
  formData.append("noise_suppression", String(args.noiseSuppression));
  if (args.chineseStyle) {
    formData.append("chinese_style", args.chineseStyle);
  }
  if (args.chineseScript) {
    formData.append("chinese_script", args.chineseScript);
  }
  return fetchJson<TranscribeResponse>("/transcribe", { method: "POST", body: formData });
}

export async function apiUpsertJobRecord(payload: {
  job_id: string;
  filename?: string | null;
  display_name?: string | null;
  media_path?: string | null;
  media_kind?: string | null;
  media_hash?: string | null;
  media_size?: number | null;
  media_mtime?: number | null;
  status?: string | null;
  language?: string | null;
  device?: string | null;
  summary?: string | null;
  transcript_json?: unknown;
  transcript_text?: string | null;
  segment_count?: number | null;
  duration?: number | null;
  ui_state?: unknown;
}): Promise<{ success?: boolean; error?: string }> {
  return fetchJson<{ success?: boolean; error?: string }>("/api/job/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function apiGetJobRecord(jobId: string): Promise<{ success?: boolean; record?: any; error?: string }> {
  return fetchJson<{ success?: boolean; record?: any; error?: string }>(`/api/job/record/${jobId}`);
}

export async function apiRemoveJob(jobId: string): Promise<RemoveJobResponse> {
  return fetchJson<RemoveJobResponse>(`/job/${jobId}`, { method: "DELETE" });
}

export async function apiEditSegment(args: {
  jobId: string;
  segmentId: number;
  newText: string;
}): Promise<{ success?: boolean; message?: string }> {
  return fetchJson<{ success?: boolean; message?: string }>("/api/segment/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId,
      new_text: args.newText
    })
  });
}

export async function apiUpdateSegmentTiming(args: {
  jobId: string;
  segmentId: number;
  start: number;
  end: number;
}): Promise<{ success?: boolean; message?: string }> {
  return fetchJson<{ success?: boolean; message?: string }>("/api/segment/timing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId,
      start: args.start,
      end: args.end
    })
  });
}

export async function apiAddSegment(args: {
  jobId: string;
  start: number;
  end: number;
  text: string;
  segmentId?: number;
}): Promise<{ success?: boolean; message?: string; segment?: any }> {
  return fetchJson<{ success?: boolean; message?: string; segment?: any }>("/api/segment/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId,
      start: args.start,
      end: args.end,
      text: args.text
    })
  });
}

export async function apiDeleteSegment(args: {
  jobId: string;
  segmentId: number;
}): Promise<{ success?: boolean; message?: string }> {
  return fetchJson<{ success?: boolean; message?: string }>("/api/segment/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId
    })
  });
}

export async function apiConvertChinese(args: {
  text: string;
  target: "traditional" | "simplified";
}): Promise<string> {
  const payload = await fetchJson<ConvertChineseResponse>("/convert_chinese", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: args.text, target: args.target })
  });
  if (payload && payload.success && typeof payload.converted_text === "string") {
    return payload.converted_text;
  }
  throw new Error(payload?.error || "Chinese conversion failed");
}

export async function apiImportYoutube(url: string): Promise<YoutubeImportResponse> {
  return fetchJson<YoutubeImportResponse>("/import/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
}

export async function apiStartYoutubeImport(url: string): Promise<YoutubeImportStatus> {
  return fetchJson<YoutubeImportStatus>("/import/youtube/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
}

export async function apiGetYoutubeImport(downloadId: string): Promise<YoutubeImportStatus> {
  return fetchJson<YoutubeImportStatus>(`/import/youtube/${downloadId}`);
}
