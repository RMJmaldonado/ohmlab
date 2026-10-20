import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    // El núcleo está escrito en TypeScript: se incluye dentro del proceso
    // principal en vez de cargarse desde node_modules.
    build: { externalizeDeps: { exclude: ["@ohmlab/core"] } },
  },
  preload: {},
  renderer: {
    plugins: [react()],
  },
});
