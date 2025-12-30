export type ExportLanguage = "simplified" | "traditional";

export type ConvertChineseResponse = {
  success?: boolean;
  converted_text?: string;
  error?: string;
};
