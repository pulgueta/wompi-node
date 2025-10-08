import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  clean: true,
  format: ["esm", "cjs"],
  splitting: false,
  treeshake: true,
  minify: true,
  outDir: "dist",
});

