import type { FetchArgs } from "@reduxjs/toolkit/query";
import { api } from "./baseApi";
import { request } from "./request";
import type { HistoryResponse, JobStatusResponse, PollResponse, RemoveJobResponse } from "../types";

export type UpsertJobRecordPayload = {
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
};

export type JobRecordResponse = { success?: boolean; record?: any; error?: string };

export const jobsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getHistory: build.query<HistoryResponse, void>({
      query: () => "/history"
    }),
    getJob: build.query<JobStatusResponse, string>({
      query: (jobId) => `/job/${jobId}`
    }),
    pollJob: build.query<PollResponse, string>({
      query: (jobId) => `/job/${jobId}/poll`
    }),
    removeJob: build.mutation<RemoveJobResponse, string>({
      query: (jobId) => ({ url: `/job/${jobId}`, method: "DELETE" })
    }),
    upsertJobRecord: build.mutation<{ success?: boolean; error?: string }, UpsertJobRecordPayload>({
      query: (payload) => ({
        url: "/api/job/record",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
      })
    }),
    getJobRecord: build.query<JobRecordResponse, string>({
      query: (jobId) => `/api/job/record/${jobId}`
    })
  })
});

export const {
  useGetHistoryQuery,
  useLazyGetHistoryQuery,
  useGetJobQuery,
  useLazyGetJobQuery,
  usePollJobQuery,
  useLazyPollJobQuery,
  useRemoveJobMutation,
  useUpsertJobRecordMutation,
  useLazyGetJobRecordQuery
} = jobsApi;

export async function apiGetHistory(): Promise<HistoryResponse> {
  return request<HistoryResponse>("/history");
}

export async function apiGetJob(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/job/${jobId}`);
}

export async function apiPollJob(jobId: string): Promise<PollResponse> {
  return request<PollResponse>(`/job/${jobId}/poll`);
}

export async function apiRemoveJob(jobId: string): Promise<RemoveJobResponse> {
  return request<RemoveJobResponse>({ url: `/job/${jobId}`, method: "DELETE" } as FetchArgs);
}

export async function apiUpsertJobRecord(payload: UpsertJobRecordPayload): Promise<{ success?: boolean; error?: string }> {
  return request<{ success?: boolean; error?: string }>({
    url: "/api/job/record",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  } as FetchArgs);
}

export async function apiGetJobRecord(jobId: string): Promise<JobRecordResponse> {
  return request<JobRecordResponse>(`/api/job/record/${jobId}`);
}
