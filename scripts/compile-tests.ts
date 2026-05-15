/**
 * Compiles all *.test.civet files to *.test.ts so bun test can discover them.
 * Skips files whose .ts is newer than the .civet source (incremental).
 * Compiles in parallel.
 * Compiled files are gitignored.
 */
import { Glob } from "bun"
import { compile } from "@danielx/civet"
import { resolve, dirname } from "node:path"
import { mkdirSync, statSync } from "node:fs"

const root = resolve(import.meta.dir, "..")
const glob = new Glob("src/**/*.test.civet")

const tasks: Promise<"compiled" | "cached">[] = []

for await (const file of glob.scan(root)) {
  const srcPath = resolve(root, file)
  const outPath = srcPath.replace(/\.civet$/, ".ts")

  tasks.push((async () => {
    let outMtime = 0
    try { outMtime = statSync(outPath).mtimeMs } catch {}
    const srcMtime = statSync(srcPath).mtimeMs

    if (outMtime >= srcMtime) return "cached"

    const source = await Bun.file(srcPath).text()
    const compiled = (await compile(source, { comptime: true } as any)) as string
    mkdirSync(dirname(outPath), { recursive: true })
    await Bun.write(outPath, compiled)
    return "compiled"
  })())
}

const results = await Promise.all(tasks)
const compiled = results.filter(r => r === "compiled").length
const cached = results.length - compiled
console.error(`Test files: ${compiled} compiled, ${cached} cached.`)
