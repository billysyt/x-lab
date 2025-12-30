import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppTab } from "../../shared/types";

type AppState = {
  activeTab: AppTab;
  version: string | null;
  showExportModal: boolean;
  showPremiumModal: boolean;
  showPremiumStatusModal: boolean;
  isPlayerModalOpen: boolean;
  isPlayerModalVisible: boolean;
  isLeftDrawerOpen: boolean;
  isTranscriptEdit: boolean;
};

const initialState: AppState = {
  activeTab: "media",
  version: null,
  showExportModal: false,
  showPremiumModal: false,
  showPremiumStatusModal: false,
  isPlayerModalOpen: false,
  isPlayerModalVisible: false,
  isLeftDrawerOpen: false,
  isTranscriptEdit: false
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
    },
    setShowExportModal(state, action: PayloadAction<boolean>) {
      state.showExportModal = action.payload;
    },
    setShowPremiumModal(state, action: PayloadAction<boolean>) {
      state.showPremiumModal = action.payload;
    },
    setShowPremiumStatusModal(state, action: PayloadAction<boolean>) {
      state.showPremiumStatusModal = action.payload;
    },
    setIsPlayerModalOpen(state, action: PayloadAction<boolean>) {
      state.isPlayerModalOpen = action.payload;
    },
    setIsPlayerModalVisible(state, action: PayloadAction<boolean>) {
      state.isPlayerModalVisible = action.payload;
    },
    setIsLeftDrawerOpen(state, action: PayloadAction<boolean>) {
      state.isLeftDrawerOpen = action.payload;
    },
    setIsTranscriptEdit(state, action: PayloadAction<boolean>) {
      state.isTranscriptEdit = action.payload;
    }
  }
});

export const {
  setActiveTab,
  setVersion,
  setShowExportModal,
  setShowPremiumModal,
  setShowPremiumStatusModal,
  setIsPlayerModalOpen,
  setIsPlayerModalVisible,
  setIsLeftDrawerOpen,
  setIsTranscriptEdit
} = slice.actions;
export const uiReducer = slice.reducer;
