import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export const DEMO_BASE_PATH = "/demo/logistics/fulfillment/";

export default defineConfig({
  base: DEMO_BASE_PATH,
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    open: DEMO_BASE_PATH,
  },
  preview: {
    open: DEMO_BASE_PATH,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
});
