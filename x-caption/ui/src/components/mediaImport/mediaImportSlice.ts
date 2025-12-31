import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type MediaImportState = {
  modals: {
    open: boolean;
    youtube: boolean;
    internet: boolean;
    import: boolean;
  };
  youtube: {
    url: string;
    importing: boolean;
    error: string | null;
    progress: number | null;
    importId: string | null;
    title: string | null;
    status: string | null;
  };
  internet: {
    url: string;
    importing: boolean;
    error: string | null;
    progress: number | null;
    importId: string | null;
    title: string | null;
    status: string | null;
  };
};

type MediaImportPatch = {
  modals?: Partial<MediaImportState["modals"]>;
  youtube?: Partial<MediaImportState["youtube"]>;
  internet?: Partial<MediaImportState["internet"]>;
};

const initialState: MediaImportState = {
  modals: {
    open: false,
    youtube: false,
    internet: false,
    import: false
  },
  youtube: {
    url: "",
    importing: false,
    error: null,
    progress: null,
    importId: null,
    title: null,
    status: null
  },
  internet: {
    url: "",
    importing: false,
    error: null,
    progress: null,
    importId: null,
    title: null,
    status: null
  }
};

const slice = createSlice({
  name: "mediaImport",
  initialState,
  reducers: {
    patchMediaImport(state, action: PayloadAction<MediaImportPatch>) {
      const { modals, youtube, internet } = action.payload;
      if (modals) {
        state.modals = { ...state.modals, ...modals };
      }
      if (youtube) {
        state.youtube = { ...state.youtube, ...youtube };
      }
      if (internet) {
        state.internet = { ...state.internet, ...internet };
      }
    },
    resetYoutubeRuntime(state) {
      state.youtube.importing = false;
      state.youtube.error = null;
      state.youtube.progress = null;
      state.youtube.importId = null;
      state.youtube.title = null;
      state.youtube.status = null;
    },
    resetInternetRuntime(state) {
      state.internet.importing = false;
      state.internet.error = null;
      state.internet.progress = null;
      state.internet.importId = null;
      state.internet.title = null;
      state.internet.status = null;
    },
    resetMediaImport(state) {
      state.modals = { ...initialState.modals };
      state.youtube = { ...initialState.youtube };
      state.internet = { ...initialState.internet };
    }
  }
});

export const { patchMediaImport, resetYoutubeRuntime, resetInternetRuntime, resetMediaImport } = slice.actions;
export const mediaImportReducer = slice.reducer;
