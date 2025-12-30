import { api } from "./baseApi";
import { request } from "./request";
import type { WhisperModelDownload, WhisperModelStatus } from "../types";

export const modelApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWhisperModelStatus: build.query<WhisperModelStatus, void>({
      query: () => "/models/whisper/status"
    }),
    startWhisperModelDownload: build.mutation<WhisperModelDownload, void>({
      query: () => ({ url: "/models/whisper/download", method: "POST" })
    }),
    getWhisperModelDownload: build.query<WhisperModelDownload, string>({
      query: (downloadId) => `/models/whisper/download/${downloadId}`
    })
  })
});

export const {
  useGetWhisperModelStatusQuery,
  useLazyGetWhisperModelStatusQuery,
  useStartWhisperModelDownloadMutation,
  useLazyGetWhisperModelDownloadQuery
} = modelApi;

export async function apiGetWhisperModelStatus(): Promise<WhisperModelStatus> {
  return request<WhisperModelStatus>("/models/whisper/status");
}

export async function apiStartWhisperModelDownload(): Promise<WhisperModelDownload> {
  return request<WhisperModelDownload>({ url: "/models/whisper/download", method: "POST" });
}

export async function apiGetWhisperModelDownload(downloadId: string): Promise<WhisperModelDownload> {
  return request<WhisperModelDownload>(`/models/whisper/download/${downloadId}`);
}
