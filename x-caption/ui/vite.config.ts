import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/static/ui/",
  build: {
    outDir: path.resolve(__dirname, "../static/ui"),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "app.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "app.css";
          }
          return assetInfo.name ?? "asset";
        },
        inlineDynamicImports: true
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/health": "http://127.0.0.1:11220",
      "/ready": "http://127.0.0.1:11220",
      "/history": "http://127.0.0.1:11220",
      "/convert_chinese": "http://127.0.0.1:11220",
      "/api": "http://127.0.0.1:11220",
      "/job": "http://127.0.0.1:11220",
      "/preprocess_audio": "http://127.0.0.1:11220",
      "/transcribe": "http://127.0.0.1:11220",
      "/models": "http://127.0.0.1:11220",
      "/download": "http://127.0.0.1:11220",
      "/audio": "http://127.0.0.1:11220",
      "/media": "http://127.0.0.1:11220",
      "/import": "http://127.0.0.1:11220",
      "/premium": "http://127.0.0.1:11220",
      "/proxy": "http://127.0.0.1:11220",
      "/static/vendor": "http://127.0.0.1:11220"
    }
  }
});
