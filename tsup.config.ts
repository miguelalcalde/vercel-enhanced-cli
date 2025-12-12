import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"], // CLI tools typically use CJS
  dts: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  minify: false,
})
