/**
 * End-to-end bench against the real https://bun.sh/llms.txt corpus.
 *
 * Run with:
 *   bun --preload @danielx/civet/bun-civet scripts/bench.ts
 *
 * Strategy: pre-fetch once (cold path, hits the network) into a temporary
 * SQLite cache, then mitata iterates the cache-hit paths that an MCP agent
 * actually hammers — getDocument, runFetch w/ warm cache, FTS lookups, plus
 * the pure-CPU steps (sha256, parseLlmsTxt) that run inside every fresh
 * fetch on the crawl path.
 */
import { mkdirSync, mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { bench, run, summary, do_not_optimize } from "mitata"

// Use a throwaway cache dir so the bench doesn't trash the user's ~/.cache/lx.
const tmp = mkdtempSync(join(tmpdir(), "lx-bench-"))
process.env.LX_DB_PATH = join(tmp, "bench.db")
mkdirSync(tmp, { recursive: true })

const { getDocument, searchFts } = await import("../src/db.civet")
const { runFetch } = await import("../src/commands/fetch.civet")
const { sha256Hex } = await import("../src/hash.civet")
const { parseLlmsTxt } = await import("../src/crawl.civet")

const URL = "https://bun.sh/llms.txt"

console.error(`[bench] cache: ${process.env.LX_DB_PATH}`)
console.error(`[bench] cold-fetching ${URL} (also crawls every linked .md — first run is slow)…`)
const t0 = Bun.nanoseconds()
await runFetch(URL, { ttl: "7d", fresh: false, quiet: true })
console.error(`[bench] cold fetch + crawl: ${((Bun.nanoseconds() - t0) / 1e9).toFixed(2)}s`)

const cached = getDocument(URL)
if (!cached) throw new Error("expected llms.txt cached after warm-up")
const content = cached.content
console.error(`[bench] llms.txt: ${content.length} bytes\n`)

await summary(async () => {
  bench("getDocument(llms.txt) — warm SQLite lookup", () => {
    do_not_optimize(getDocument(URL))
  })

  bench("runFetch(llms.txt, cached) — full pipeline, cache hit", async () => {
    await runFetch(URL, { ttl: "7d", fresh: false, quiet: true })
  })

  bench("sha256Hex(content) — Bun.CryptoHasher", () => {
    do_not_optimize(sha256Hex(content))
  })

  bench("parseLlmsTxt(content) — extract H1 + crawl links", () => {
    do_not_optimize(parseLlmsTxt(content))
  })

  bench('searchFts("websocket", 10) — FTS5 + bm25', () => {
    do_not_optimize(searchFts("websocket", 10))
  })

  // FTS5 treats `.` as a token boundary — quote the phrase to keep the query parseable.
  bench('searchFts("\\"Bun serve\\"", 10, source) — FTS5 scoped to llms.txt', () => {
    do_not_optimize(searchFts('"Bun serve"', 10, URL))
  })
})

await run()
