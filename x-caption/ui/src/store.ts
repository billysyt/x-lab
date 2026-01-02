import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "./api";
import { uiReducer } from "./components/layout/uiSlice";
import { jobsReducer } from "./components/jobs/jobsSlice";
import { settingsReducer } from "./components/settings/settingsSlice";
import { transcriptReducer } from "./components/transcript/transcriptSlice";
import { mediaImportReducer } from "./components/mediaImport/mediaImportSlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    app: uiReducer,
    jobs: jobsReducer,
    settings: settingsReducer,
    transcript: transcriptReducer,
    mediaImport: mediaImportReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware)
});

setupListeners(store.dispatch);

// Expose store to window for native menu integration
if (typeof window !== "undefined") {
  (window as any).store = store;
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
