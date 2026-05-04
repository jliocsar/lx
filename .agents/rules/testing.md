# lx Testing Rules

## Pipeline

Test files are written in Civet (`*.test.civet`) but must be compiled before `bun test` can discover them:

```bash
bun run test           # compile + run
bun run test:coverage  # compile + run + coverage report
```

The compile step (`scripts/compile-tests.ts`) transpiles each `*.test.civet` → `*.test.ts` (gitignored).

## Bun plugin (`src/civet-test-plugin.ts`)

Registered as `[test].preload` in `bunfig.toml`. Handles loading `.civet` source files during test execution with `inlineMap: true` for accurate coverage line mapping. Does NOT scan for test files (that's handled by the compile step).

## Test environment

- `src/test-setup.ts` sets `LX_DB_PATH=':memory:'` — all DB operations use SQLite in-memory
- Each test file wrapped in a top-level `describe('module-name', ...)` for proper `beforeEach`/`afterEach` scoping
- Compiled test files all run in the same Bun realm (single process), so describe-scoped hooks are critical

## Mocking patterns

**Global fetch:** Mock `globalThis.fetch` in `beforeEach`, restore in `afterEach` via `originalFetch` capture.

**process.exit:** Use `spyOn(process, 'exit').mockImplementation(code => { throw new Error(\`exit:\${code}\`) })`. Catch exit errors with `.rejects.toThrow('exit:N')`.

**process.stdout/stderr:** Use `spyOn` to capture output into local strings. Restore in `afterEach`.

**DB cleanup:** Call `_clearDocuments()` in `beforeEach`. Each test file gets the same in-memory DB instance.

**No `mock.module`:** Avoid module-level mocking — use global fetch mocks and dependency injection instead. `main()` in `index.civet` accepts optional `{ runGet, runList }` deps for testability.

## Civet pitfalls in test files

- Bare property in implicit call (`url` alone) compiles as positional arg, not `{ url }`. Always write `url: url`.
- `(expr1; expr2)` is invalid Civet. Use indented blocks instead.
- `@danielx/civet/bun-civet` top-level preload handles dev (`bun run`); `[test].preload` handles test runner.

## Coverage rules

- Target: 100% line and function coverage
- `unless condition` guards on module-level side effects won't be covered if env var is always set — prefer unconditional calls where safe (e.g. `mkdirSync` with `{ recursive: true }`)
- `import.meta.main` guard: write as single-line `if import.meta.main then expr` so the line counts as covered even when false
- 304 path tests MUST use expired cached docs (`expires_at` in the past) — non-expired cache hits the cache-return path before `fetchDoc` is called
