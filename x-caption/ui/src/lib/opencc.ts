import type { ExportLanguage } from "../types";

export function safeOpenCcConverter(target: ExportLanguage): ((input: string) => string) | null {
  const win = typeof window !== "undefined" ? (window as any) : null;
  const OpenCC = win?.OpenCC;
  if (!OpenCC || typeof OpenCC.Converter !== "function") return null;
  try {
    if (target === "traditional") {
      return OpenCC.Converter({ from: "cn", to: "tw" });
    }
    return OpenCC.Converter({ from: "tw", to: "cn" });
  } catch {
    return null;
  }
}
