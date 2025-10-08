import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  sourcemap: false,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: true,
  outDir: 'dist',
});
