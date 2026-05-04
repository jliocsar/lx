# lx

Blazingly fast markdown fetcher, cache, and search index for `llms.txt` corpora.

## Install

```bash
bun install
```

## Usage

```bash
bun run dev fetch https://bun.sh/llms.txt    # fetch & cache (also crawls llms.txt links)
bun run dev list                              # list cached docs
bun run dev sources                           # list crawled llms.txt sources
bun run dev search "websocket"                # full-text search across cache
LX_EMBED_ENABLED=1 bun run dev vector "auth"  # semantic search (gated by env flag)
bun run dev mcp                               # run as MCP stdio server
```

## Build standalone binary

```bash
bun run build   # → ./dist/lx
```
