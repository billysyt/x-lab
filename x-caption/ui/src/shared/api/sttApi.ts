import type {
  ConvertChineseResponse,
  HistoryResponse,
  JobStatusResponse,
  PollResponse,
  PreprocessResponse,
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

export async function apiTranscribeAudio(args: {
  file: File;
  model: string;
  language: string;
  noiseSuppression: boolean;
  preprocessId?: string | null;
  chineseStyle?: "spoken" | "written";
  chineseScript?: "traditional" | "simplified";
}): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append("file", args.file);
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
  if (args.preprocessId) {
    formData.append("preprocess_id", args.preprocessId);
  }
  return fetchJson<TranscribeResponse>("/transcribe", { method: "POST", body: formData });
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
