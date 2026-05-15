# Roadmap

## Core (already in / committed)

- `lx <url>` / `lx fetch <url>` — fetch + cache (default command alias)
- `llms.txt` crawler — walk every linked entry, fetch + cache each `.md`
- TTL on every entry — stale → refetch (configurable: `warn` / `auto` / `manual`)
- Storage: SQLite at `~/.lx/cache.db` (or wherever the current impl puts it)

## Locked-in additions

### 1. Search + vector

Once the cache exists, every fetched doc is a row in SQLite. That's a corpus on disk. Unlock both:

- **`lx search <query>`** — full-text via SQLite FTS5. Free, fast, exact-match.
- **`lx vector <query>`** — embed on insert (small local model — `all-MiniLM-L6-v2` or similar via `@xenova/transformers`?), vector search via `sqlite-vec` or `libsql` vector cols. Semantic queries like "auth flow" find docs even without that exact phrase.

Both should respect a `--source <llms.txt-url>` filter so you can scope to "just bun docs" or "just supabase".

### 2. MCP server

**`lx mcp`** — expose the cache as an MCP server.

Tools:
- `fetch_doc(url)` — return cached content
- `search_docs(query, source?)` — FTS
- `vector_search_docs(query, source?, top_k?)` — semantic
- `list_sources()` — what `llms.txt` files have been crawled
- `list_docs(source?)` — what `.md`s are cached

This is the killer flag. Agents pull docs from the local cache instead of hitting the network — zero latency, zero supply-chain attack surface for already-vetted sources, no prompt-injection vector via doc fetches.

### 3. Graph

**`lx graph <llms.txt-url>`** — render the link graph of an `llms.txt` cache. Which `.md` doc references which.

- Library: [`beautiful-mermaid`](https://www.npmjs.com/package/beautiful-mermaid) for output
- Output modes:
  - `--format mermaid` — raw mermaid text (pipeable)
  - `--format svg` — rendered svg
  - `--format html` — standalone html w/ embedded mermaid
- Useful for: visualizing doc structure, finding orphan docs in an `llms.txt`, sanity-checking a freshly-crawled source

## Probably-want (post-core)

- **`lx serve`** — HTTP proxy mode at `localhost:PORT/llms?url=...`. For tools that aren't MCP-aware.
- **`lx watch <llms.txt>`** — daemon mode, periodic refresh on a schedule. Desktop notification on diff via `notify-send`.
- **`lx diff <url>`** — `content_hash` already in the design, so show what changed since last cache. Could autogenerate "what's new in `bun.sh` docs since last week".
- **`lx lock <url>`** — pin a known-good version, never auto-refresh. For when you've validated a specific snapshot.
- **`lx audit [url]`** / **`lx audit --all`** — LLM injection-defense pass (the original `lx` design): refetch → run through cheap fast LLM (Haiku / Gemini Flash) → flag HTML comments w/ imperatives, multilingual injections, "if you're an AI assistant" patterns, semantic drift, off-topic imperatives. Store verdict + reasoning in DB. Valid → replace cache. Invalid → error, keep old.
- **`lx export <url> [--format json|md|jsonl]`** — pipe-friendly for chains.
- **`lx stats`** — coverage, staleness heatmap, top-fetched, total cache size.
- **`lx prune`** / **`lx rm <url>`** — eviction.

## Stack notes

- Runtime: Bun (dogfooding)
- Source language: Civet (`.civet` → TS via `@danielx/civet`) — current setup
- DB: `bun:sqlite` for v1; consider `libsql` if remote replication ever needed (probably not)
- Vector: `sqlite-vec` (small, embed-friendly) or `libsql` vector cols
- Embedder: `@xenova/transformers` w/ a small local model — no API key, runs on CPU, deterministic

## Open questions

- Should `lx ingest` know about the vault directly, or just emit MD files to a target dir + leave wiki integration to a separate skill?
- TTL default — 24h? 7d? Per-source override?
- Audit layer — ship as opt-in flag, or always-on for fresh fetches with `audit: skip` config to disable?
- MCP server lifecycle — long-running daemon, or ephemeral spawn-per-claude-session like parley adapters?

## Why this exists

1. **Speed** — Claude Code agents hit the same `llms.txt` files repeatedly. Network fetch every time is wasteful. Cache once, query forever.
2. **Supply-chain defense** — even allowlisted sources can be compromised (phished maintainer → injected HTML comment → agent reads, exfils). Local vetted cache breaks the chain.
3. **Searchable corpus** — once cached, you have a queryable doc library. Search across every framework you've ever crawled, locally, in milliseconds.
4. **Agent-native** — MCP server means every Claude session has the doc library at its fingertips, no setup per project.
