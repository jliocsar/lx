/**
 * Compiles all *.test.civet files to *.test.ts so bun test can discover them.
 * Compiled files are gitignored — this script runs before bun test.
 */
import { Glob } from "bun"
import { compile } from "@danielx/civet"
import { resolve, dirname } from "node:path"
import { mkdirSync } from "node:fs"

const root = resolve(import.meta.dir, "..")
const glob = new Glob("src/**/*.test.civet")

let count = 0
for await (const file of glob.scan(root)) {
  const srcPath = resolve(root, file)
  const outPath = srcPath.replace(/\.civet$/, ".ts")

  const source = await Bun.file(srcPath).text()
  const compiled = (await compile(source, { comptime: true } as any)) as string

  mkdirSync(dirname(outPath), { recursive: true })
  await Bun.write(outPath, compiled)
  count++
}

console.error(`Compiled ${count} test file(s).`)
