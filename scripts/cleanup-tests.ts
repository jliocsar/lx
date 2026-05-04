import { Glob } from "bun"
import { unlinkSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const glob = new Glob("src/**/*.test.ts")

let count = 0
for await (const file of glob.scan(root)) {
  unlinkSync(resolve(root, file))
  count++
}

if (count) console.error(`Removed ${count} compiled test file(s).`)
