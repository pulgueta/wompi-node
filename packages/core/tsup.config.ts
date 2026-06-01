import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/schemas.ts"],
  clean: true,
  splitting: true,
  treeshake: true,
  dts: true,
  format: ["cjs", "esm"],
  minify: true,
  outDir: "dist",
});
