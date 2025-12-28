export type AppTab = "media" | "captions" | "history";

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled" | "imported";

export type ExportLanguage = "simplified" | "traditional";

export type AudioFileInfo = {
  name: string;
  size: number | null;
  path: string | null;
  wasTranscoded?: boolean;
  originalPath?: string | null;
  hash?: string | null;
  mtime?: number | null;
};

export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  originalText?: string;
};

export type TranscriptResult = {
  job_id?: string;
  file_path?: string;
  segments?: TranscriptSegment[];
  text?: string;
  language?: string;
  device?: string;
  model?: string;
  transcription_time?: number;
  total_processing_time?: number;
  normalized_audio_path?: string;
  original_audio_path?: string;
};

export type Job = {
  id: string;
  filename: string;
  displayName?: string;
  status: JobStatus;
  message: string;
  progress: number | null;
  startTime: number;
  completedAt?: number;
  language?: string;
  device?: string;
  summary?: string;
  outputFile?: string | null;
  textFile?: string | null;
  formattedTextFile?: string | null;
  audioFile?: AudioFileInfo | null;
  result?: TranscriptResult | null;
  partialResult?: TranscriptResult | null;
  error?: string | null;
  currentStage?: string | null;
  lastSyncedAt?: number;
  streamingSegments?: TranscriptSegment[];
  expectedSegments?: number;
  mediaHash?: string | null;
  mediaSize?: number | null;
  mediaMtime?: number | null;
  mediaInvalid?: boolean;
  uiState?: any;
};

export type HistoryEntry = {
  job_id: string;
  status?: string;
  message?: string;
  created_at?: string;
  completed_at?: string;
  language?: string;
  device?: string;
  output_file?: string;
  text_file?: string;
  formatted_text_file?: string;
  summary?: string;
  progress?: number;
  original_filename?: string;
  display_name?: string;
  media_path?: string;
  media_kind?: string;
  media_hash?: string;
  media_size?: number;
  media_mtime?: number;
  media_invalid?: boolean;
  ui_state?: any;
  audio_file?: {
    name?: string;
    size?: number;
    path?: string;
    original_path?: string;
    hash?: string;
    mtime?: number;
  };
  result_preview?: TranscriptResult | null;
};

export type HistoryResponse = {
  jobs?: HistoryEntry[];
};

export type PreprocessResponse = {
  preprocess_id: string;
  playback_url: string;
  audio_file?: {
    name?: string;
    path?: string;
    size?: number;
    was_transcoded?: boolean;
  };
  original_file?: {
    path?: string;
    size?: number;
  };
};

export type WhisperModelStatus = {
  ready: boolean;
  model_path?: string | null;
  expected_path?: string;
  download_url?: string;
  filename?: string;
  size_bytes?: number | null;
};

export type WhisperModelDownload = {
  download_id?: string;
  status: string;
  progress?: number | null;
  downloaded_bytes?: number | null;
  total_bytes?: number | null;
  message?: string | null;
  error?: string | null;
  error_type?: string | null;
  expected_path?: string;
  download_url?: string;
};

export type TranscribeResponse = {
  job_id: string;
  status: string;
  message?: string;
  filename?: string;
  websocket_channel?: string;
  media_hash?: string | null;
  media_size?: number | null;
  media_mtime?: number | null;
  audio_file?: {
    name?: string;
    path?: string;
    size?: number;
    was_transcoded?: boolean;
  };
};

export type JobStatusResponse = {
  job_id: string;
  status: string;
  created_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  meta?: Record<string, unknown>;
  result?: TranscriptResult;
  error?: string;
};

export type PollUpdate = {
  event: string;
  data: unknown;
  timestamp: number;
};

export type PollResponse = {
  success?: boolean;
  updates?: PollUpdate[];
  error?: string;
};

export type RemoveJobResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  warnings?: string[];
};

export type ConvertChineseResponse = {
  success?: boolean;
  converted_text?: string;
  error?: string;
};

export type YoutubeImportResponse = {
  file?: {
    name?: string;
    path?: string;
    size?: number | null;
    mime?: string | null;
  };
  source?: {
    url?: string | null;
    title?: string | null;
    id?: string | null;
  };
  stream_url?: string | null;
  duration_sec?: number | null;
  error?: string;
};

export type YoutubeResolveResponse = {
  stream_url?: string | null;
  source?: {
    url?: string | null;
    title?: string | null;
    id?: string | null;
  };
  duration_sec?: number | null;
  error?: string;
};

export type YoutubeImportStatus = YoutubeImportResponse & {
  download_id?: string;
  status?: string;
  progress?: number | null;
  message?: string | null;
  error?: string | null;
};
