import { api } from "./baseApi";
import { request } from "./request";
import type { FetchArgs } from "@reduxjs/toolkit/query";

export type EditSegmentArgs = { jobId: string; segmentId: number; newText: string };
export type UpdateSegmentTimingArgs = { jobId: string; segmentId: number; start: number; end: number };
export type AddSegmentArgs = { jobId: string; start: number; end: number; text: string; segmentId?: number };
export type DeleteSegmentArgs = { jobId: string; segmentId: number };

export const segmentsApi = api.injectEndpoints({
  endpoints: (build) => ({
    editSegment: build.mutation<{ success?: boolean; message?: string }, EditSegmentArgs>({
      query: (args) => ({
        url: "/api/segment/edit",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          job_id: args.jobId,
          segment_id: args.segmentId,
          new_text: args.newText
        }
      })
    }),
    updateSegmentTiming: build.mutation<{ success?: boolean; message?: string }, UpdateSegmentTimingArgs>({
      query: (args) => ({
        url: "/api/segment/timing",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          job_id: args.jobId,
          segment_id: args.segmentId,
          start: args.start,
          end: args.end
        }
      })
    }),
    addSegment: build.mutation<{ success?: boolean; message?: string; segment?: any }, AddSegmentArgs>({
      query: (args) => ({
        url: "/api/segment/add",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          job_id: args.jobId,
          segment_id: args.segmentId,
          start: args.start,
          end: args.end,
          text: args.text
        }
      })
    }),
    deleteSegment: build.mutation<{ success?: boolean; message?: string }, DeleteSegmentArgs>({
      query: (args) => ({
        url: "/api/segment/delete",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          job_id: args.jobId,
          segment_id: args.segmentId
        }
      })
    })
  })
});

export const {
  useEditSegmentMutation,
  useUpdateSegmentTimingMutation,
  useAddSegmentMutation,
  useDeleteSegmentMutation
} = segmentsApi;

export async function apiEditSegment(args: EditSegmentArgs): Promise<{ success?: boolean; message?: string }> {
  return request<{ success?: boolean; message?: string }>({
    url: "/api/segment/edit",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId,
      new_text: args.newText
    })
  } as FetchArgs);
}

export async function apiUpdateSegmentTiming(args: UpdateSegmentTimingArgs): Promise<{ success?: boolean; message?: string }> {
  return request<{ success?: boolean; message?: string }>({
    url: "/api/segment/timing",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId,
      start: args.start,
      end: args.end
    })
  } as FetchArgs);
}

export async function apiAddSegment(args: AddSegmentArgs): Promise<{ success?: boolean; message?: string; segment?: any }> {
  return request<{ success?: boolean; message?: string; segment?: any }>({
    url: "/api/segment/add",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId,
      start: args.start,
      end: args.end,
      text: args.text
    })
  } as FetchArgs);
}

export async function apiDeleteSegment(args: DeleteSegmentArgs): Promise<{ success?: boolean; message?: string }> {
  return request<{ success?: boolean; message?: string }>({
    url: "/api/segment/delete",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: args.jobId,
      segment_id: args.segmentId
    })
  } as FetchArgs);
}
