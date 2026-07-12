# lx Design Reference

## What it does

CLI tool that fetches, caches, and searches markdown docs locally. Reads from SQLite cache on subsequent calls. Crawls `llms.txt` files to bulk-fetch all linked markdown docs. Optional MCP stdio server exposes the cache to agents.

## Architecture

```
src/
  index.civet              # CLI entry: subcommand dispatch
  db.civet                 # SQLite schema + prepared statements (incl. FTS5 + sqlite-vec)
  fetch.civet              # HTTP: fetchDoc with content-type validation
  crawl.civet              # llms.txt parsing (strict spec) + concurrent fetch pool
  cache.civet              # TTL parsing (w/d/h/m), expiry checks
  embed.civet              # transformers.js + Mastra chunking, gated by LX_EMBED_ENABLED
  commands/
    fetch.civet            # lx fetch <url>
    list.civet             # lx list [--source]
    sources.civet          # lx sources
    search.civet           # lx search <query> [--source --limit --json]
    vector.civet           # lx vector <query> [--source --top-k --json]
    mcp.civet              # lx mcp (stdio MCP server)
```

## Database

- `~/.cache/lx/cache.db` (user-global SQLite)
- Override: `LX_DB_PATH=':memory:'` for tests
- Schema (`PRAGMA user_version = 1`):
  - `documents(url PK, content, content_hash, fetched_at, expires_at, etag, last_modified)`
  - `document_sources(doc_url, source_url, PK both)` — junction for `--source` filtering
  - `documents_fts` — FTS5 external-content over `documents.content`, tokenizer `porter unicode61`
  - `vec_chunks` — `sqlite-vec` `vec0` virtual table: `(doc_url, chunk_idx, +chunk_text, embedding float[384])`. Created only if `sqlite-vec` extension loads.
- Triggers keep `documents_fts` in sync with `documents`.
- PRAGMAs: WAL + NORMAL sync + memory temp store + 256MB mmap + 20MB cache.
- On schema-version mismatch: drop everything and recreate (no migration runner).

## URL validation

- HTTPS only
- `.txt` → must be exactly `/llms.txt`
- `.md` or `.mdx` → any filename

## llms.txt parsing (strict per llmstxt.org)

- Must start with `# H1` (required)
- Optional `> blockquote` summary
- Optional body paragraphs/lists (no headings)
- Zero or more `## H2` sections containing `- [text](url)` link lists
- Links extracted ONLY from H2 sections
- Any deviation → error exit 1

## Fetch behavior

`llms.txt` URL:
1. Validate strict format
2. Extract links from H2 sections
3. Fetch all links concurrently (pool of 10)
4. Each child: insert into `documents` + `document_sources` (parent llms.txt URL)
5. If `LX_EMBED_ENABLED` and content hash changed: chunk + embed → `vec_chunks`
6. Output llms.txt content

`llms-full.txt` URL: fetch → hash → cache as one document → output a heading summary by default. Use `--verbose` to print the full fetched content. `--range` prints the requested source-content line slice, not the generated summary.

`.md` / `.mdx` URL: fetch → hash → cache → optionally embed → output.

Content-type validation: `text/html` → reject; `text/markdown`/`text/plain`/`text/x-markdown` → accept; else → reject.

## TTL

- Formats: `7d`, `24h`, `30m`, `2w`
- Default: `7d`
- `expires_at = NULL` → never expires (requires `--fresh`)
- Expired → cache miss → auto-refetch
- 304 Not Modified → resets TTL using cached content

## CLI

```
lx fetch <url> [--ttl 7d] [--fresh] [--range start:end] [--verbose]
lx list [--source <url>]
lx sources
lx search <query> [--source <url>] [--limit 10] [--json]
lx vector <query> [--source <url>] [--top-k 10] [--json]    # requires LX_EMBED_ENABLED=1
lx mcp                                                        # stdio MCP server
lx --help
```

## Embedding (LX_EMBED_ENABLED)

- Off by default (env var unset → no embedding, no model download).
- On: lazy-loads `@huggingface/transformers` via dynamic import, pulls `Xenova/all-MiniLM-L6-v2` (q8 quantized, 384-dim) into `~/.cache/lx/models/`, embeds at fetch time.
- Chunking: Mastra `MDocument.fromMarkdown(...).chunk({ strategy: 'markdown' })` — split on H1/H2/H3.
- Re-embed only when `content_hash` changes (304 and identical-content paths skip).
- Docs cached without embedding stay un-embedded; `lx vector` prints a warning listing them and excludes them from results. Re-fetch with `--fresh` to embed.

## MCP server

- `@modelcontextprotocol/sdk` v1.x via `McpServer.registerTool(name, config, handler)`.
- Stdio transport only.
- Tools: `fetch_doc(url, range?)`, `search_docs(query, source?, limit?)`, `vector_search_docs(query, source?, top_k?)`, `list_sources()`, `list_docs(source?)`.
- `vector_search_docs` returns `isError: true` content when `LX_EMBED_ENABLED` is unset or `sqlite-vec` failed to load.
- Ephemeral spawn-per-session pattern (no daemon).

## Standalone binary (`bun run build`)

- `Bun.build({ compile: true, bytecode: true })` produces `./dist/lx`.
- Vector path requires native `onnxruntime-node`, which doesn't survive `--compile` (depends on system `libonnxruntime.so`). Setting `LX_EMBED_ENABLED=1` with the binary degrades to a runtime warning. All other commands work in the binary.
- For vector features: `bun install -g` or `bun --preload @danielx/civet/bun-civet src/index.civet …`.

## main() dependency injection

`main(argv, deps?)` accepts optional `{ runFetch?, runList?, runSources?, runSearch?, runVector?, runMcp? }` for testing without module mocking.

## Concurrency pool

`pool<T>(items, concurrency, fn)` in `crawl.civet` — creates `min(concurrency, items.length)` workers that drain the items array atomically.
