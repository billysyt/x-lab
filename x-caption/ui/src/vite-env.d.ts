/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_CHECK_URL: string;
  readonly VITE_UPDATE_PROJECT: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_PREMIUM_PAGE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
