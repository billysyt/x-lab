import { api } from "./baseApi";
import { request } from "./request";
import type { WhisperModelDownload, WhisperModelStatus, WhisperPackageDownload, WhisperPackageStatus } from "../types";

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
    }),
    getWhisperPackageStatus: build.query<WhisperPackageStatus, void>({
      query: () => "/models/whisper/package/status"
    }),
    startWhisperPackageDownload: build.mutation<WhisperPackageDownload, void>({
      query: () => ({ url: "/models/whisper/package/download", method: "POST" })
    }),
    getWhisperPackageDownload: build.query<WhisperPackageDownload, string>({
      query: (downloadId) => `/models/whisper/package/download/${downloadId}`
    })
  })
});

export const {
  useGetWhisperModelStatusQuery,
  useLazyGetWhisperModelStatusQuery,
  useStartWhisperModelDownloadMutation,
  useLazyGetWhisperModelDownloadQuery,
  useGetWhisperPackageStatusQuery,
  useLazyGetWhisperPackageStatusQuery,
  useStartWhisperPackageDownloadMutation,
  useLazyGetWhisperPackageDownloadQuery
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

export async function apiGetWhisperPackageStatus(): Promise<WhisperPackageStatus> {
  return request<WhisperPackageStatus>("/models/whisper/package/status");
}

export async function apiStartWhisperPackageDownload(): Promise<WhisperPackageDownload> {
  return request<WhisperPackageDownload>({ url: "/models/whisper/package/download", method: "POST" });
}

export async function apiGetWhisperPackageDownload(downloadId: string): Promise<WhisperPackageDownload> {
  return request<WhisperPackageDownload>(`/models/whisper/package/download/${downloadId}`);
}
