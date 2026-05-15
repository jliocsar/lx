/**
 * Bun plugin for loading .civet files in the test runner.
 * Registered as a [test] preload in bunfig.toml.
 * Compiles Civet to TypeScript with inline source maps for accurate coverage reporting.
 */
import { plugin } from "bun"
import { compile } from "@danielx/civet"

plugin({
  name: "Civet test loader",
  setup(builder) {
    builder.onLoad({ filter: /\.civet$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      const contents = (await compile(source, { comptime: true, inlineMap: true, filename: path } as any)) as string
      return { contents, loader: "tsx" }
    })
  },
})
