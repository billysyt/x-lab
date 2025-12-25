import { configureStore } from "@reduxjs/toolkit";
import { uiReducer } from "../features/ui/uiSlice";
import { jobsReducer } from "../features/jobs/jobsSlice";
import { settingsReducer } from "../features/settings/settingsSlice";
import { transcriptReducer } from "../features/transcript/transcriptSlice";

export const store = configureStore({
  reducer: {
    app: uiReducer,
    jobs: jobsReducer,
    settings: settingsReducer,
    transcript: transcriptReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
