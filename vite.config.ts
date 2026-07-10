import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("maplibre-gl")) {
            return "maplibre";
          }

          if (id.includes("@supabase/supabase-js")) {
            return "supabase";
          }

          if (
            id.includes("react-router") ||
            id.includes("@tanstack/react-query") ||
            id.includes("react-dom") ||
            id.match(/[\\/]react[\\/]/)
          ) {
            return "react-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./vitest.setup.ts",
  },
});
