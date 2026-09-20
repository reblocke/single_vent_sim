import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.APP_BASE ?? "/",
  build: { target: "es2022" },
});
