import { api } from "./baseApi";
import { request } from "./request";
import type { ConvertChineseResponse, ExportResponse, ExportSegmentPayload, ExportLanguage } from "../types";

export const exportApi = api.injectEndpoints({
  endpoints: (build) => ({
    convertChinese: build.mutation<ConvertChineseResponse, { text: string; target: "traditional" | "simplified" }>({
      query: (args) => ({
        url: "/convert_chinese",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: args
      })
    })
  })
});

export const { useConvertChineseMutation } = exportApi;

export async function apiConvertChinese(args: {
  text: string;
  target: "traditional" | "simplified";
}): Promise<string> {
  const payload = await request<ConvertChineseResponse>({
    url: "/convert_chinese",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: args.text, target: args.target })
  });
  if (payload && payload.success && typeof payload.converted_text === "string") {
    return payload.converted_text;
  }
  throw new Error(payload?.error || "Chinese conversion failed");
}

export async function apiExportTranscript(args: {
  segments: ExportSegmentPayload[];
  exportLanguage: ExportLanguage | string;
}): Promise<ExportResponse> {
  return request<ExportResponse>({
    url: "/export/transcript",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segments: args.segments,
      export_language: args.exportLanguage
    })
  });
}

export async function apiExportSrt(args: {
  segments: ExportSegmentPayload[];
  exportLanguage: ExportLanguage | string;
}): Promise<ExportResponse> {
  return request<ExportResponse>({
    url: "/export/srt",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segments: args.segments,
      export_language: args.exportLanguage
    })
  });
}
