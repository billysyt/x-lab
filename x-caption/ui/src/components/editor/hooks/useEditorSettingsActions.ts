import { useCallback } from "react";
import { setChineseStyle, setLanguage, type SettingsState } from "../../settings/settingsSlice";
import { setExportLanguage } from "../../transcript/transcriptSlice";
import type { AppDispatch } from "../../../store";

type EditorSettingsActionsParams = {
  dispatch: AppDispatch;
  exportLanguage: string;
};

export function useEditorSettingsActions(params: EditorSettingsActionsParams) {
  const { dispatch, exportLanguage } = params;

  const handleToggleChineseVariant = useCallback(() => {
    dispatch(setExportLanguage(exportLanguage === "traditional" ? "simplified" : "traditional"));
  }, [dispatch, exportLanguage]);

  const onLanguageChange = useCallback(
    (value: SettingsState["language"]) => {
      dispatch(setLanguage(value));
    },
    [dispatch]
  );

  const onChineseStyleChange = useCallback(
    (value: SettingsState["chineseStyle"]) => {
      dispatch(setChineseStyle(value));
    },
    [dispatch]
  );

  return { handleToggleChineseVariant, onLanguageChange, onChineseStyleChange };
}
