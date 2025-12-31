import { api } from "./baseApi";
import { request } from "./request";
import type { YoutubeImportStatus } from "../types";

export type InternetImportStatus = YoutubeImportStatus;

export const internetApi = api.injectEndpoints({
  endpoints: (build) => ({
    startInternetImport: build.mutation<InternetImportStatus, string>({
      query: (url) => ({
        url: "/import/internet/start",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { url }
      })
    }),
    getInternetImport: build.query<InternetImportStatus, string>({
      query: (downloadId) => `/import/internet/${downloadId}`
    })
  })
});

export const {
  useStartInternetImportMutation,
  useLazyGetInternetImportQuery
} = internetApi;

export async function apiStartInternetImport(url: string): Promise<InternetImportStatus> {
  return request<InternetImportStatus>({
    url: "/import/internet/start",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
}

export async function apiGetInternetImport(downloadId: string): Promise<InternetImportStatus> {
  return request<InternetImportStatus>(`/import/internet/${downloadId}`);
}
