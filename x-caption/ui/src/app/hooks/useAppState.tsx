import { useEditorState } from "../../features/editor/hooks/useEditorState";

export function useAppState() {
  return useEditorState();
}

export type AppState = ReturnType<typeof useEditorState>;
