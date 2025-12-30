import type { FetchArgs } from "@reduxjs/toolkit/query";
import { runBaseQuery } from "./baseApi";

export async function request<T>(args: string | FetchArgs): Promise<T> {
  const result = await runBaseQuery<T>(args);
  if ("error" in result) {
    const data = result.error.data as any;
    const message = data?.error || data?.message || result.error.error || "Request failed";
    throw new Error(String(message));
  }
  return result.data as T;
}
