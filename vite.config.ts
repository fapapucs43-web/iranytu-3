import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NOTE: Freebuff requires HMR to stay disabled — do not add hmr settings here.

/**
 * The AI runtime gets its own NAMED chunk, and the name is load-bearing.
 *
 * `@mlc-ai/web-llm` is only ever imported dynamically (from `lib/ai.ts`, and
 * only when the reader presses "download" or generates in on-device mode), so
 * Rollup already puts it in a chunk nothing else references. Left unnamed that
 * chunk is `assets/index-<hash>.js` — indistinguishable from the app's own
 * code — and the service worker's generator precaches every `/assets/*` file,
 * which would download ~6 MB of runtime on every install, for a feature that
 * is off by default and whose MODEL (335 MB) is never precached at all, so the
 * runtime would be useless offline anyway.
 *
 * Naming it `webllm-runtime` is what lets `scripts/precache-manifest.mjs`
 * exclude it by pattern instead of by size or by sniffing bytes. If this
 * function ever stops running, the chunk reverts to `index-*.js`, lands back
 * in the precache, and the install grows by 6 MB — the precache tests pin the
 * rule, and the guard in the generator fails the build loudly if an entry
 * this large ever slips through.
 */
const isWebLlm = (id: string) => id.includes("@mlc-ai/web-llm");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (isWebLlm(id)) return "webllm-runtime";
        },
      },
    },
  },
});
