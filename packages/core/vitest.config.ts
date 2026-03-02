import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    coverage: {
      clean: true,
      provider: "v8",
      cleanOnRerun: true,
      reporter: ["json", "json-summary", "text"],
    },
    globals: true,
  },
});
