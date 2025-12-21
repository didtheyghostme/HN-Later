import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "HN Later",
    description: "Read later + comment progress tracking for Hacker News.",
    version: "0.1.0",
    permissions: ["storage", "tabs"],
    host_permissions: ["https://news.ycombinator.com/*"],
  },
  vite: () => ({
    plugins: [react()],
  }),
});
