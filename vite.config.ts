import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api/hosted": { target: "http://127.0.0.1:8787", changeOrigin: false },
    },
  },
  preview: { host: "0.0.0.0", port: 4173 },
});
