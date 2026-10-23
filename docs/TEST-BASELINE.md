# Test baseline — Phase 0

Recorded 2026-10-23 on branch `phase-0-cleanup` (on top of `v0.7.0`, commit `0b74bcd`), before any Phase 0 code fixes.

Machine: Windows 11, Go 1.27.0 (`go.mod` says `go 1.25.0`), Node 24.20.0, npm 11.19.0, TypeScript 5.8.3, Vitest 3.2.4.
CI uses Node 22 and the Go version from `go.mod`.

| Command | Result |
| --- | --- |
| `go vet ./...` | **Fails** — 9 warnings, all in `internal/api/server_test.go` ("using resp before checking for errors": `resp` ×5, `resp2` ×2, `resp4` ×2) |
| `go test ./...` | Passes — 127 tests passed, 1 skipped, 0 failed, across 20 packages with tests (12 packages have no test files) |
| `go test -race ./...` | Not run locally: needs CGO and a C compiler, and this machine has neither (`CGO_ENABLED=0`, no `gcc`). Runs in CI on Linux |
| `npm ci` | Passes — 301 packages added; npm audit reports 18 vulnerabilities (2 low, 5 moderate, 7 high, 4 critical) |
| `npm run build` | **Fails** in `packages/ide` — 22 TypeScript errors (`Canvas.tsx` 18, `store/projectStore.ts` 4), all strict null / `noUncheckedIndexedAccess` checks. `packages/operator` builds on its own |
| `npm test --workspace=packages/ide -- --run` | Passes — 1 test file, 3 tests (`src/hooks/useTag.test.tsx`) |

## Notes

- Skipped Go test: `TestOPCUALive` in `internal/drivers/opcua`, which needs `X_HMI_OPCUA_ENDPOINT` set to a live server.
- Packages without tests: `cmd/spike`, `cmd/x-hmi`, `internal/alarms`, `internal/alarmstore`, `internal/drivers`, `internal/drivers/cert`, `internal/historian/providers/memory`, `internal/historian/providers/sqlite`, `internal/mcp`, `internal/runtime`, `internal/versionstore`.
- Locally, Vitest also picks up a stale compiled copy `src/hooks/useTag.test.js` (git-ignored) and reports 2 files / 6 tests. A clean checkout has 1 file / 3 tests.
- The first local `npm ci` failed on a corrupt npm cache (`ENOENT` in `_cacache`); `npm cache verify` fixed it. Not a project problem.
- The vet warnings and the IDE build errors are fixed in task 7 on this branch; the npm audit findings are left for a later phase.
