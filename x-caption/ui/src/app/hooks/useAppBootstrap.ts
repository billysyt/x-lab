import { useEffect } from "react";
import { setVersion } from "../../features/ui/uiSlice";
import { bootstrapJobs } from "../../features/jobs/jobsSlice";
import type { AppDispatch } from "../store";

export function useAppBootstrap(dispatch: AppDispatch) {
  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const version = typeof win?.__APP_VERSION__ === "string" ? win.__APP_VERSION__ : null;
    const envVersion =
      typeof (import.meta as any)?.env?.VITE_APP_VERSION === "string"
        ? (import.meta as any).env.VITE_APP_VERSION
        : null;
    const resolvedVersion = version || (envVersion ? String(envVersion).trim() : null);
    if (resolvedVersion) {
      dispatch(setVersion(resolvedVersion));
    }
    dispatch(bootstrapJobs()).catch(() => undefined);
  }, [dispatch]);
}
