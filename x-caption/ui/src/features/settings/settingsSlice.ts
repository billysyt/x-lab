import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SettingsState = {
  language: "auto" | "yue" | "zh" | "en";
  noiseSuppression: boolean;
  model: "whisper";
  chineseStyle: "spoken" | "written";
};

const initialState: SettingsState = {
  language: "auto",
  noiseSuppression: false,
  model: "whisper",
  chineseStyle: "spoken"
};

const slice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setLanguage(state, action: PayloadAction<SettingsState["language"]>) {
      state.language = action.payload;
    },
    setNoiseSuppression(state, action: PayloadAction<boolean>) {
      state.noiseSuppression = action.payload;
    },
    setModel(state, action: PayloadAction<SettingsState["model"]>) {
      state.model = action.payload;
    },
    setChineseStyle(state, action: PayloadAction<SettingsState["chineseStyle"]>) {
      state.chineseStyle = action.payload;
    }
  }
});

export const { setLanguage, setNoiseSuppression, setModel, setChineseStyle } = slice.actions;
export const settingsReducer = slice.reducer;
