import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppTab } from "../../shared/types";

type AppState = {
  activeTab: AppTab;
  version: string | null;
};

const initialState: AppState = {
  activeTab: "media",
  version: null
};

const slice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setActiveTab(state, action: PayloadAction<AppTab>) {
      state.activeTab = action.payload;
    },
    setVersion(state, action: PayloadAction<string>) {
      state.version = action.payload;
    }
  }
});

export const { setActiveTab, setVersion } = slice.actions;
export const uiReducer = slice.reducer;
