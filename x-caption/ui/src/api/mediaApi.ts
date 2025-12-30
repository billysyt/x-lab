import { api } from "./baseApi";
import { request } from "./request";
import type { PreprocessResponse, TranscribeResponse } from "../types";

export type TranscribeArgs = {
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
  secondCaptionEnabled?: boolean;
  secondCaptionLanguage?: "yue" | "zh" | "en";
};

export const mediaApi = api.injectEndpoints({
  endpoints: (build) => ({
    preprocessAudio: build.mutation<PreprocessResponse, File>({
      query: (file) => {
        const formData = new FormData();
        formData.append("file", file);
        return { url: "/preprocess_audio", method: "POST", body: formData };
      }
    }),
    transcribeAudio: build.mutation<TranscribeResponse, TranscribeArgs>({
      query: (args) => {
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
        if (typeof args.secondCaptionEnabled === "boolean") {
          formData.append("second_caption_enabled", String(args.secondCaptionEnabled));
        }
        if (args.secondCaptionLanguage) {
          formData.append("second_caption_language", args.secondCaptionLanguage);
        }
        return { url: "/transcribe", method: "POST", body: formData };
      }
    })
  })
});

export const { usePreprocessAudioMutation, useTranscribeAudioMutation } = mediaApi;

export async function apiPreprocessAudio(file: File): Promise<PreprocessResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request<PreprocessResponse>({ url: "/preprocess_audio", method: "POST", body: formData });
}

export async function apiTranscribeAudio(args: TranscribeArgs): Promise<TranscribeResponse> {
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
  if (typeof args.secondCaptionEnabled === "boolean") {
    formData.append("second_caption_enabled", String(args.secondCaptionEnabled));
  }
  if (args.secondCaptionLanguage) {
    formData.append("second_caption_language", args.secondCaptionLanguage);
  }
  return request<TranscribeResponse>({ url: "/transcribe", method: "POST", body: formData });
}
