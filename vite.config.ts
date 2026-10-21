import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NOTE: Freebuff requires HMR to stay disabled — do not add hmr settings here.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 900,
  },
});
