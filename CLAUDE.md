# Speth's Screens — ground truth for Claude Code

Read this whole file before changing anything. If the code and this file disagree, stop and ask Dan.
This file summarizes the v2 architecture plan (Dan's doc "X-HMI v2 Architecture"). It supersedes `ROADMAP.md` wherever they differ.

## What this is

Speth's Screens (formerly X-HMI) is a web-based HMI platform for Phoenix Contact PLCnext controllers, built to become a consumer-grade product.

- **Runtime:** one Go binary. It talks to PLCs, keeps the tag values, runs alarms, the historian, logins and the API, and serves the operator screen.
- **IDE:** a React app in the browser where screens are designed and deployed to a runtime.
- **Operator screen:** a React app in the browser, read-only for design and served by the runtime.
- **Project:** one JSON file, validated by `schema.json`.

Dan is the only developer and owns the code.

## Name

- Product name, everywhere a person reads it: **Speth's Screens**. Mention "formerly X-HMI" only in the README.
- Code-safe name (binary, `cmd/` folder, npm package names): `speths-screens`.
- Go module path: `github.com/Speth12/Speths_Screens` (matches the repository name).
- Keep opening existing `.xhmi.json` project files. Changing the project file extension is a later decision for Dan.
- Repository: `github.com/Speth12/Speths_Screens` (public), cloned to `C:\Users\speth\source\repos\Speths_Screens`. It started from a single fresh commit; the full earlier history stays in `Speth12/The-HMI-Development` (local folder `C:\Users\speth\source\repos\x-hmi`), which still contains `spike-key.pem` and `project/project.json`. Never push that history to the new repository. Ask Dan before renaming either repository or folder.

## Stack (locked — ask Dan before changing)

| Layer | Choice |
| --- | --- |
| Runtime | Go (see `go.mod`), chi router, coder/websocket, modernc.org/sqlite (no CGO) |
| Drivers | PLCnext REST (net/http), OPC UA (gopcua), Modbus TCP (simonvetter/modbus), MQTT (paho; mochi-mqtt for the embedded broker), calculated tags (`virtual`) |
| IDE and operator | React 19, Vite, Zustand, Tailwind; npm workspaces `packages/ide`, `packages/operator`, `packages/shared-types` |
| Contract | `schema.json` generates `internal/project/types.go` and `packages/shared-types/src/project.ts` with `npm run gen:types`. Both apps import their project types from `@speths-screens/shared-types`; CI fails if the generated files drift from the schema |
| Scripting (Phase 4) | JavaScript. Runtime scripts run in goja; screen scripts run in a Web Worker |
| Canvas | Our own canvas in `packages/ide` |

## Dead ends — never reintroduce

- A Rust runtime.
- GrapesJS or any HTML page-builder canvas.
- The Node.js/Express gateway from the April builds.
- PLCnext GDS over gRPC on a Unix socket (dropped: host mounts and permissions were fragile).
- Lua or WASM scripting (`ROADMAP.md` still mentions it; it is out).
- `eval` or `new Function` on user-written expressions. Existing uses are scheduled for removal in Phase 3.

## Repo map

| Path | What it holds |
| --- | --- |
| `cmd/speths-screens` | Entry point. `--mode=dev` (port 3001) or `--mode=runtime` (port 8080). Embeds `cmd/speths-screens/ui` (operator build) |
| `internal/runtime` | Orchestrator: loads the project, starts drivers, pumps values into the tag store |
| `internal/tagstore` | In-memory tag values and subscribers |
| `internal/drivers/*` | One package per driver; interface in `internal/drivers/driver.go` |
| `internal/api` | HTTP routes (`server.go`, `routes.go`) and WebSockets (`ws.go`) |
| `internal/historian`, `alarms`, `alarmstore`, `audit`, `security`, `recipestore`, `versionstore`, `namespace`, `faceplate`, `assets`, `mcp` | Platform services |
| `internal/expr` | Unused. Delete in Phase 3 when the shared expression engine lands |
| `packages/ide`, `packages/operator` | The two browser apps. Widgets are currently duplicated between them (fixed in Phase 2) |
| `schema.json` | The project contract |
| `demo.xhmi.json` | Demo project; must keep loading through every phase |
| `project/project.json` | Dan's local project with real credentials. **Never commit it.** Use `project/project.example.json` |

## Build, run and test (Windows PowerShell; `make` is optional)

```powershell
go vet ./...
go test ./...
npm ci
npm run build
npm test --workspace=packages/ide -- --run

go run ./cmd/speths-screens --mode=dev --project=demo.xhmi.json   # runtime on :3001
npm run dev                                              # IDE on :5173
npm run dev:operator                                     # operator on :7001
```

## Rules

1. Ask Dan before changing the locked stack, the dead-ends list, the shape of `schema.json`, or any public API route.
2. Dan owns four areas: concurrency primitives (tag store, runtime pump, subscription manager), protocol state machines (driver connect, login, reconnect), security boundaries (logins, roles, write checks) and `schema.json`. For these, write a short plan first and wait for his approval before coding.
3. One branch per phase (`phase-1-readwrite-core`, and so on). Small commits. Never push to `main`; open a pull request.
4. Every behavior change comes with a test. Go tests are table-driven. Drivers are tested against fakes, for example an `httptest` server that imitates the PLCnext REST interface.
5. Never edit generated types by hand. Change `schema.json`, then run `npm run gen:types`.
6. Never commit secrets: no passwords, tokens or keys in code, tests, fixtures or logs. `*.pem` and `project/project.json` are git-ignored.
7. Never make a failing test pass by deleting or skipping it.
8. End each session with a short report: what changed, which tests ran, and open questions.

## PLCnext REST facts the driver relies on

- Reachable variables: only global variables with the HMI attribute set in PLCnext Engineer.
- Read: `GET /_pxc_api/api/variables?paths=a,b,c` (optional `pathPrefix`). Versioned paths (`/_pxc_api/v1.x/...`) also work; the driver probes the version.
- Write: `PUT /_pxc_api/api/variables` with `{"variables":[{"path":"...","value":...,"valueType":"Constant"}]}`. `valueType` defaults to `Constant`.
- Login, when the controller requires it: `POST /_pxc_api/v1.2/auth/auth-token` with `{"scope":"variables"}` returns a `code`; `POST /_pxc_api/v1.2/auth/access-token` with `{code, grant_type:"authorization_code", username, password}` returns `access_token`. Send `Authorization: Bearer <token>`, refresh before expiry, retry once on 401. This flow comes from an earlier build; verify it against the controller before relying on it.
- Controllers use self-signed certificates. Today the driver always skips certificate checks; make that a per-datasource setting in Phase 1.

## Current phase: Phase 0 — clean up

Gate: CI green on `main`, and the test baseline recorded in `docs/TEST-BASELINE.md`.

Old history: the new repository was started fresh, so `spike-key.pem` and `project/project.json` were never in it. Do not rewrite history or force-push unless Dan asks.

Status (2026-10-23): **Phase 0 done.** PR #1 merged; CI green on `main` (`b0a092f`).

1. Save the uncommitted work on `day7-ide-polish-and-demo` (7 files, July: login always on with a first-run admin user, a dev-mode login bypass, IDE panel tweaks). Show Dan the diff summary, commit it, push.
2. Fast-forward `main` to `day7-ide-polish-and-demo` (`git merge --ff-only`), tag `v0.7.0`, push. Delete the local leftovers `master` (stale, Day 5) and `day6-rest-driver-and-modal-redesign` (fully contained in day7). Remove the `old-origin` remote (the April repo). Ask Dan before deleting remote branches.
3. On a new branch `phase-0-cleanup`: commit this `CLAUDE.md` (already in the folder). Create `.github/workflows/ci.yml` with three jobs on every push and pull request: `go` (setup-go from `go.mod`, `go vet ./...`, `go test -race ./...`), `web` (Node 22, `npm ci`, `npm run build`, `npm test --workspace=packages/ide -- --run`) and `secrets` (`gitleaks/gitleaks-action@v2` with full history). Stop tracking `packages/ide/node_modules`, `packages/operator/node_modules`, `spike-key.pem`, `spike-cert.pem` and `project/project.json` (`git rm -r --cached`; the files stay on disk), add `project/project.json` to `.gitignore` and add `project/project.example.json` with every username and password emptied.
4. Record the baseline: run the commands under "Build, run and test" and write the results to `docs/TEST-BASELINE.md`.
5. Rename to Speth's Screens, in two commits on `phase-0-cleanup`. Build and tests must pass after each.
    - Commit A, what people read: page titles, IDE and operator headers, the about/demo panels, log prefixes (`[X-HMI]` becomes `[Speth's Screens]`), `README.md`, and docs.
    - Commit B, code names: Go module `github.com/Speth12/x-hmi` becomes `github.com/Speth12/speths-screens` (update every import); `cmd/x-hmi` becomes `cmd/speths-screens`; binary `x-hmi(.exe)` becomes `speths-screens(.exe)`; root npm package `x-hmi` becomes `speths-screens`; update `Makefile`, `Dockerfile`, `docker-compose.yml`, `.gitignore` binary entries and `.claude/launch.json`.
    - Before commit B, list every place you will change and show Dan.
6. Put `schema.json` back in charge. Widget `dynamics`, page `script`, the project `namespace`, theme and canvas settings were added to the generated types by hand. Show Dan the plan for the new types first, then add them to `schema.json` with real types (no `unknown[]`), regenerate, and fix compile errors. Add a CI step that runs `npm run gen:types` and fails when `git diff --exit-code` shows changes. **Done:** the schema now also covers `theme`, `security`, `users` (bcrypt `passwordHash` only), faceplates, images, UDTs and assets. Value fields (`onValue`, `writeValue`, recipe and state values) stay "any" until Phase 1 item 8.
7. Open a pull request from `phase-0-cleanup` to `main` and fix whatever keeps CI red, without skipping or deleting tests. Known red items: the 9 `go vet` warnings in `internal/api/server_test.go`.

Local files that are git-ignored and must stay out of commits: `*.db` (the historian `history.db` is about 850 MB because it stores every update; Phase 1 fixes that), `*.pem`, and the built binaries in the repo root.

## Next: Phase 1 — read/write core

Branch `phase-1-readwrite-core`. Gate: a 24-hour soak test against the AXC F 3152 with no frozen values, and every write either confirmed or failed with a reason.

Defect 5 decisions (Dan, 2026-10-23): `Connect` only checks the config and starts the loop; the driver reaches the PLC, logs in and reconnects on its own (states: starting, online, offline). One failed request for a group (network error, timeout, HTTP 5xx, a 401 that one fresh login doesn't fix) takes the driver offline: every polled tag goes Bad keeping its last value, `Status()` shows the reason, retries back off from 1 s doubling to 30 s with ±20% jitter, and writes fail at once. A per-variable error (`NotExists`) makes only that tag Bad. `TagState` and the WebSocket tag message get an optional `reason`. Long `paths=` lists are split so each URL stays under 2000 bytes. Login and token refresh are built and tested against a fake; not yet verified on a controller with user authentication on. MQTT subscribes again after a reconnect and marks exact-topic tags Bad while the connection is lost. Per-datasource certificate checking is a separate change (needs `schema.json`). Live unplug test (2026-10-23): REST tags went Bad and recovered on their own; detection took the 8 s HTTP timeout and the reason held the whole URL, so the timeout is now 3 s and reasons are short ("no answer from 10.0.0.210 (timed out)").

OPC UA failures (Dan, 2026-10-23; found in the unplug test, where OPC UA tags stayed Good): the OPC UA driver gets the same states as REST. `Connect` starts the goroutine, which discovers endpoints and connects; gopcua's AutoReconnect is off and the driver reconnects itself with the shared backoff. A failed read (error, timeout, lost session) takes it offline: tags Bad with last value and a short reason, writes fail at once, client closed and reconnected. A Bad status on one node makes only that tag Bad, with the status name as the reason. Request and dial timeouts are 3 s. Backoff and short reasons live in `internal/drivers` for both drivers. `TestDatasource` waits until the driver is online or reports an error.

Defect 6 decisions (Dan, 2026-10-23): staleness is measured from when the tag store last received a tag, not from the value's timestamp (an OPC UA source timestamp stays old while the value is steady). Only polled datasources (REST, OPC UA, Modbus) are checked; MQTT and calculated tags only send on change. A Good tag with no update for 10 s turns Uncertain, keeping its value, with the reason "no update for 10s"; the next update makes it Good. Bad tags are left alone. The runtime checks every second; check and mark happen in one critical section under the store lock.

Defect 7 decisions (Dan, 2026-10-23): the pump calls `Historian.Enqueue`, which never blocks; one historian goroutine filters and writes in batches (one transaction per 500 rows or per second) and writes what is queued on Close. An update is stored when its value or quality changes, when it is the first for its path, or when the path was last stored 60 s ago. Any change counts for now; a per-tag deadband needs a schema field and is a later change. When the 10 000-update queue is full, updates are dropped and counted, with a log line at most once a minute. `Record` and `RecordWrite` (manual-write audit samples) stay synchronous and unfiltered. The existing large `history.db` is not migrated; retention trims it.

Known defects, in fix order:

Defect 1 decisions (Dan, 2026-10-23): drivers get the output channel in `Connect(ctx, cfg, out)` and run one poll loop from `Connect` to `Disconnect`; `SetTags` swaps the tag set and is a no-op when the set is unchanged; an empty set keeps the driver connected but idle. OPC UA is covered by unit tests plus the soak test if no fake server works.

Defect 2 decisions (Dan, 2026-10-23): every tag referenced in the project (screens, alarms, calculated-tag inputs) is polled all the time; WebSocket clients add their own subscriptions on top. Namespace nodes alone create no demand. Recipes create no demand. The historian stores whatever is polled until defect 7. `GET /api/v1/debug/demand` lists each needed tag and its sources.

Defect 3 decisions (Dan, 2026-10-23): a `tagstore.Mailbox` (newest value per path, `Put` never blocks) sits between fan-ins and the pump and inside every store watcher; drivers wait on their fan-in instead of dropping. `TagStore.Subscribe` is replaced by `Watch` (`Add`, `Remove`, `C`, `Drain`, `Close`), one watcher per WebSocket connection. Defect 4 was done in the same change. Alarm and event-bus drops are item 10, not defect 3.

1. ~~`internal/runtime/runtime.go` `LoadProject` calls `drv.Subscribe` on every load, so each deploy adds another poll loop. Replace `Subscribe` with an idempotent `SetTags(paths)` on every driver.~~ Done.
2. ~~`tagsForDatasource` only collects `Widget.Binding` and `Widget.VisibleBinding`. Tags used by dynamics, trend pens, multi-state, alarm rules, recipes, faceplate parameters and calculated tags are never polled unless they are also a main binding or a namespace tag. Build a subscription manager that counts demand from open screens (WebSocket subscriptions), alarms, the historian, scripts and calculated tags, and hands each driver one tag list.~~ Done.
3. ~~Silent drops: `select { case ch <- u: default: }` in `drivers/rest` (`pxcReadGroup`, `pollLoop`), the runtime fan-in goroutines and `tagstore.Update`. Replace them with a latest-value slot per tag so a slow consumer skips values but always ends on the newest.~~ Done.
4. ~~`tagstore.Update` scans every subscription per update and logs every update. Look subscribers up by path; drop per-update logging.~~ Done with defect 3.
5. ~~`drivers/rest`: a failed poll only logs. Mark every tag in the batch Bad with a reason, report disconnected, reconnect with backoff. Add login and token refresh. Split long `paths=` lists.~~ Done.
6. ~~`tagstore.MarkStale` is never called. Run it on a timer in the runtime. It reads then writes, so a pump update in between would be overwritten with the stale value; make the mark conditional on the value being unchanged.~~ Done.
7. ~~`historian.Record` does one synchronous SQLite insert per update inside the pump. Move it to a background batcher with a per-tag deadband that stores changed values only.~~ Done.
8. `api.handleWriteTag` checks nothing. Build the write pipeline: tag must exist in the project and be writable; the user's role must allow it; convert the value to the tag's PLC type; apply limits; write; read back; reply confirmed or failed with a reason. Offer it over the WebSocket with a request id too. In the operator app, replace the three write call sites (`src/App.tsx`, `src/writeContext.ts`, `src/widgets/index.tsx`) with one client function.
9. Security defaults (Dan's decision, 2026-10-23): login is set per project by `security.mode`. `none` (the default when missing) means no login: print a warning at startup and show a "Security off" badge on the operator screen. `login` means every user must log in. Restrict CORS to configured origins (today `*`). Check the WebSocket origin (today `InsecureSkipVerify: true`).
    - Project `users` hold bcrypt `passwordHash` values, never plain text. How they relate to the runtime's `security.db` users (managed by the IDE Users panel through `/api/v1/users`) is open; ask Dan before building it.
    - With `security.mode: "login"`, replace the fixed first-run `admin`/`admin` user (July WIP, `cmd/speths-screens/main.go`) with a random first-run password shown once on the console, never written to log files, and force a password change at first login. With `none`, seed no user.
    - Dev mode (`--mode=dev`, which bypasses login) listens on `127.0.0.1` only.
    - Add tests for the dev-mode login bypass and for first-run user creation.
10. Alarm events (`internal/alarms/alarms.go`, send to subscribers) and the event bus (`internal/eventbus/eventbus.go`) drop events for slow subscribers. These are discrete events, so "newest value wins" is wrong; use a bounded per-client queue and, on overflow, tell the client to re-fetch the alarm snapshot.

## Later phases (one line each)

- **Phase 2 — widgets and project model:** one `packages/widgets` library used by both apps, a manifest per widget that drives the property panel, schema v2 widget format (`props`, `bindings`, `events`), `ns:` tag paths, templates, and an upgrader for v1 projects.
- **Phase 3 — dynamics and look:** any bindable property driven by a tag or expression through one transform; one JavaScript-syntax expression language without `eval`; design tokens; a high-performance (ISA-101 style) default theme; a widget gallery.
- **Phase 4 — scripting and local variables:** goja runtime scripts, Web Worker screen scripts, one typed API with Monaco autocomplete, typed memory tags (optionally retained), session variables.
- **Phase 5 — product:** installer, licensing, documentation, simulation mode, and AI screen-building tools on the MCP server.
