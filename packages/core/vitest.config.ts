import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    coverage: {
      clean: true,
      provider: "v8",
      cleanOnRerun: true,
      reporter: ["json", "json-summary", "text"],
      exclude: ["test/**", "**/*.config.*", "dist/**"],
    },
    globals: true,
  },
});
