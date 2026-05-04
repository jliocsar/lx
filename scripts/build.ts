/**
 * Builds lx as a standalone bytecode-optimised binary via Bun.build().
 * Uses a Civet plugin to handle .civet source files during bundling.
 * Output: ./dist/lx
 *
 * Note: vector features (LX_EMBED_ENABLED=1) load @huggingface/transformers
 * via dynamic import, which pulls onnxruntime-node — a native module that
 * doesn't survive `--compile`. The binary will run fetch/list/sources/search/mcp
 * fine; setting LX_EMBED_ENABLED=1 in the binary degrades to a runtime warning.
 * For vector support, run via `bun install -g` or `bun --preload ... src/index.civet`.
 */
import type { BunPlugin } from "bun"
import { compile } from "@danielx/civet"
import { mkdirSync, renameSync } from "node:fs"
import { resolve } from "node:path"

const civetPlugin: BunPlugin = {
  name: "Civet",
  setup(build) {
    build.onLoad({ filter: /\.civet$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      const contents = (await compile(source, { comptime: true } as any)) as string
      return { contents, loader: "tsx" }
    })
  },
}

mkdirSync("./dist", { recursive: true })

const result = await Bun.build({
  entrypoints: ["./src/index.civet"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  compile: true,
  bytecode: true,
  plugins: [civetPlugin],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

// bun build names the output after the entrypoint directory; rename to lx
const builtPath = result.outputs[0]?.path
if (builtPath && !builtPath.endsWith("/lx")) {
  renameSync(builtPath, resolve("./dist/lx"))
}

console.error("Built: ./dist/lx")
