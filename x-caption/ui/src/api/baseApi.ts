import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

type BaseQueryArgs = Parameters<ReturnType<typeof fetchBaseQuery>>[0];

type BaseQueryApi = {
  signal: AbortSignal;
  dispatch: (action: unknown) => void;
  getState: () => unknown;
};

type BaseQueryExtraOptions = Record<string, unknown>;

type BaseQueryResult<T> = { data: T } | { error: { status: number | "FETCH_ERROR" | "PARSING_ERROR" | "CUSTOM_ERROR"; data?: any; error?: string } };

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "",
  credentials: "same-origin"
});

export const api = createApi({
  reducerPath: "api",
  baseQuery: rawBaseQuery,
  endpoints: () => ({})
});

export async function runBaseQuery<T>(args: BaseQueryArgs): Promise<BaseQueryResult<T>> {
  return (await rawBaseQuery(args, {
    signal: new AbortController().signal,
    dispatch: () => undefined,
    getState: () => ({})
  } as BaseQueryApi, {} as BaseQueryExtraOptions)) as BaseQueryResult<T>;
}
