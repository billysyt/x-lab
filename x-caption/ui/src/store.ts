import { configureStore } from "@reduxjs/toolkit";
import { uiReducer } from "./components/ui/uiSlice";
import { jobsReducer } from "./components/jobs/jobsSlice";
import { settingsReducer } from "./components/settings/settingsSlice";
import { transcriptReducer } from "./components/transcript/transcriptSlice";
import { mediaImportReducer } from "./components/mediaImport/mediaImportSlice";

export const store = configureStore({
  reducer: {
    app: uiReducer,
    jobs: jobsReducer,
    settings: settingsReducer,
    transcript: transcriptReducer,
    mediaImport: mediaImportReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
