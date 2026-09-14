import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export const DEMO_BASE_PATH = "/demo/manufacturing/pump-assembly/";

export default defineConfig({
  base: DEMO_BASE_PATH,
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  build: { outDir: "dist", assetsDir: "assets", emptyOutDir: true },
});
