import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client/index.ts",
    "src/types.ts",
    "src/schemas.ts",
    "src/errors/wompi-error.ts",
    "src/server/utils/index.ts",
  ],
  clean: true,
  splitting: true,
  treeshake: true,
  dts: true,
  format: ["cjs", "esm"],
  minify: true,
  outDir: "dist",
});
