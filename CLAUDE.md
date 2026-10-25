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
| `packages/ide`, `packages/operator` | The two browser apps. Each provides a widget host (`ide/src/widgets/index.tsx`, `operator/src/widgetHost.ts`) |
| `packages/widgets` | The one widget library both apps draw from (Phase 2); widgets reach tags, writes, navigation and the API only through the `WidgetHost` |
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

# Phase 1 soak test against a real PLC (writes only the *_Write test variables, restores them):
powershell -ExecutionPolicy Bypass -File scripts\soak\run-soak.ps1 -Plc 10.0.0.210 -Hours 24   # results in soak-runs\<time>\summary.json
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
- Controllers use self-signed certificates. Each datasource has `certCheck` (`off`, `pinned`, `trusted`) and `certFingerprint`; without `certCheck` the REST driver skips the check as before (see the follow-up decisions).

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

OPC UA failures (Dan, 2026-10-23; found in the unplug test, where OPC UA tags stayed Good): the OPC UA driver gets the same states as REST. `Connect` starts the goroutine, which discovers endpoints and connects; gopcua's AutoReconnect is off and the driver reconnects itself with the shared backoff. A failed read (error, timeout, lost session) takes it offline: tags Bad with last value and a short reason, writes fail at once, client closed and reconnected. A Bad status on one node makes only that tag Bad, with the status name as the reason. Request and dial timeouts are 3 s. Backoff and short reasons live in `internal/drivers` for both drivers. `TestDatasource` waits until the driver is online or reports an error. Live unplug test with both drivers (2026-10-23): with the PLC unplugged at startup, both drivers started offline with "no answer from 10.0.0.210 (timed out)" and recovered on their own after the cable went back; unplugged while running, REST and OPC UA tags went Bad within the 3 s timeout keeping their last values, and all were Good again within about a second of reconnecting.

Defect 6 decisions (Dan, 2026-10-23): staleness is measured from when the tag store last received a tag, not from the value's timestamp (an OPC UA source timestamp stays old while the value is steady). Only polled datasources (REST, OPC UA, Modbus) are checked; MQTT and calculated tags only send on change. A Good tag with no update for 10 s turns Uncertain, keeping its value, with the reason "no update for 10s"; the next update makes it Good. Bad tags are left alone. The runtime checks every second; check and mark happen in one critical section under the store lock.

Defect 7 decisions (Dan, 2026-10-23): the pump calls `Historian.Enqueue`, which never blocks; one historian goroutine filters and writes in batches (one transaction per 500 rows or per second) and writes what is queued on Close. An update is stored when its value or quality changes, when it is the first for its path, or when the path was last stored 60 s ago. Any change counts for now; a per-tag deadband needs a schema field and is a later change. When the 10 000-update queue is full, updates are dropped and counted, with a log line at most once a minute. `Record` and `RecordWrite` (manual-write audit samples) stay synchronous and unfiltered. The existing large `history.db` is not migrated; retention trims it.

Defect 8 decisions (Dan, 2026-10-23): one pipeline, `Runtime.WriteTag`, for HTTP, WebSocket and recipe writes. A tag is writable when a writable widget (button, numeric input, text input, setpoint, or a dynamic with `writeTo`) is bound to it, directly or through a faceplate parameter, when it is a namespace tag, or when a recipe names it; anything else gets 404. The Operator role gets `tag.write`. Limits come from the writing widget's `min`/`max` (the request may name the widget; without one, the widest limits of the tag's writable widgets apply); out of range gets 400. Drivers mark errors as bad value (400), not connected (503), unknown tag (404) or rejected by the device (502). After writing, the pipeline waits up to 3 s for the value to come back (temporary demand if the tag is not polled; floats compared with a small tolerance): `confirmed` (200), or `not_confirmed` (409, with what the PLC holds). MQTT returns `sent` unless the topic is already subscribed, in which case it waits for the echo. Every write is audited with its result; the historian's manual-write sample is kept for confirmed and sent writes. WebSocket writes: `{"write":{"id","path","value","widgetId"}}` → `{"writeResult":{"id","status","reason"}}`, needing a token sent when the connection opens (dev mode and no security count as Admin); reading stays open until defect 9. The operator app uses one `writeTag` client function. Recipe writes go through the pipeline with their `recipe.apply` check. A request naming a widget that does not write the tag (widgets inside a faceplate carry their own ids) gets the widest limits. Writes to one tag from the operator app go out in order. Live check on the AXC F 3152 (2026-10-23): OPC UA and REST writes confirmed in 0.1–1 s; HMI_SIM_Temp, which the PLC program holds at 75, came back not_confirmed after 3 s; out-of-range, non-numeric and non-writable writes were refused before reaching the PLC.

Defect 9 decisions (Dan, 2026-10-23): users live on the runtime (`security.db`, managed by the first-run admin and the IDE Users panel); `users` is removed from `schema.json`. `security.mode` comes from the loaded project: `none` (or missing, or no project yet) means no login and everyone acts as Admin, with a startup and deploy warning and a "Security off" badge on the operator screen; `login` means every API route except login and `/alive` needs a token, including `GET /project`, datasource test and browse, the MCP server and WebSocket reads. Switching from `login` to `none` needs a logged-in deploy. `GET /project` blanks datasource passwords and tokens in every mode; a deploy that leaves them blank keeps the stored ones. With mode `login` and no users, the runtime creates `admin` with a random password written to `initial-admin-password` (owner-only) next to `security.db`; only the path is logged; the first login must change the password, which deletes the file. With `none`, no user is created. Dev mode listens on 127.0.0.1 only and refuses any other address. CORS and the WebSocket origin allow the runtime's own origin plus http://localhost:5173 and http://127.0.0.1:5173; `--cors-origins` adds more. The operator app gets a login screen, keeps the token for the browser session, sends it with writes and the WebSocket, forces the first password change and has a logout. Found while planning, fixed first: `GET /project` returned datasource passwords to anyone; the MCP server and `POST /datasources/test` needed no login. Also fixed: the MCP `write_tag`/`apply_recipe` tools bypassed the write pipeline; `POST /users/{name}/password` had no permission check (now `users.manage`); `/ws/events` needed no login. An existing `admin` whose password is still `admin` is flagged at startup and must change it. Dev and operator dev servers (localhost/127.0.0.1 on 5173 and 7001) are the default allowed origins. Checked live in runtime mode on a fresh user store (2026-10-23).

Item 10 decisions (Dan, 2026-10-24): alarm subscribers get a bounded queue (256 per client, 4096 for the alarm-history writer); delivery never blocks. On overflow the queue is dropped and the subscriber resyncs: `/ws/alarms` sends `{"resync": true}` and the full current snapshot (clients replace their list); the history writer records the snapshot (the store upserts by event id). `/ws/alarms` subscribes before taking its snapshot. The event bus gets the same bounded queue with a type filter (no per-type goroutines; fixes the `SubscribeAll` leak); on overflow the oldest events go and the client gets one `{"type":"overflow","payload":{"dropped":N}}`. `/ws/alarms` and `/ws/events` read from the client (`CloseRead`), so a disconnect is seen at once and the close handshake is answered.

Phase 1 follow-up decisions (Dan, 2026-10-24; branch `phase-1-followups`): (1) API calls carry the login token: the IDE uses `apiFetch` (`store/runtimeAuth.ts`), the operator app its `apiFetch`; a lint rule (`local/api-token`) refuses a bare `fetch` to `/api/v1`; the exported HTML page shows a notice on 401 until the Phase 2 export rebuild. (2) The IDE applies recipes through `POST /api/v1/recipes/{id}/apply` (the deployed copy). (3) The React hook warnings are fixed and `exhaustive-deps` is an error. (4) MQTT: `Connect` never waits for the broker; the first connect retries with the shared backoff, tags Bad with the reason meanwhile; after it, paho's auto-reconnect stays, capped at 30 s. (5) Datasource `certCheck` / `certFingerprint` in `schema.json` (`drivers.CertPolicy`): a refused certificate fails before any login is sent; missing `certCheck` keeps each driver's old behavior (REST off, MQTT trusted roots, OPC UA off) and the runtime logs a warning for TLS without a check; new datasources in the IDE default to pinned, and Test shows the fingerprint to pin. (6) OPC UA never falls back to security None: an unset mode means SignAndEncrypt / Basic256Sha256, and a server that does not offer what is asked for is an error; a project that wants no security says `securityMode: "None"`. (7) Project `historian` section: a default deadband and per-tag rules (exact `datasource:path` or a prefix ending in `*`, most specific wins), absolute units, numbers only, compared with the last stored value; quality changes and the 60 s heartbeat are always stored; `store: false` leaves tags out. (8) `historian.retentionDays` overrides `--history-retention`. Live check on the AXC F 3152 (2026-10-24): REST and OPC UA (SignAndEncrypt, which the controller offers alongside None) pinning worked; Basic128Rsa15 and Basic256 are not offered and are now refused.

Phase 2 decisions (Dan, 2026-10-24; plan doc "Speth's Screens: Phase 2 plan"; branch `phase-2-widgets`, stacked on `phase-1-followups` and rebased onto `main` once PR #2 and the follow-ups merge): (1) one `packages/widgets` workspace used by the IDE, the operator screen and the HTML export; (2) `schema.json` stays the contract, with one settings type per widget type, and manifests add only UI hints; (3) both the IDE (TypeScript) and the runtime (Go) upgrade v1 files, held to the same golden files; (4) action entries in `dynamics` move to `events` in Phase 2, visual ones wait for Phase 3; (5) a new integer `schemaVersion` (missing means 1), `version` stays the project's own version; (6) "templates" means widget presets now, page templates later; (7) the HTML export is rebuilt on the shared library; (8) the IDE offers `ns:` namespace paths before raw `datasource:path` ones. Step 1 merged the two drifted widget copies into the superset of both (see the commit message of the step 1 commit for which side each widget came from). Steps 3 and 4 (Dan, 2026-10-24: "do all 3"): a widget is `props` (one settings type per widget type, `TypedProps` oneOf on `type`), `bindings` (`value`, `visible`, `color`), `events` (`onClick`, `onPress`, `onRelease`; actions write, toggle, increment, navigate, openUrl) and visual-only `dynamics`; `schemaVersion` is 2. Every project entering the runtime (`project.Parse`: files, deploys, restores, folder projects) or the IDE (`openProject`: file, import, runtime pull, autosave) is upgraded, then checked against `schema.json` (santhosh-tekuri/jsonschema in Go, ajv in the IDE), with the same readable problems in both ("page \"Main\", widget w1 (gauge): unknown setting momentary"); the IDE refuses to deploy an invalid project. `scripts/gen-widget-types.mjs` (part of `gen:types`) generates the per-type settings types (`PropsByType` / `TypedWidget<T>` in TypeScript, `GaugeProps` and `w.AsGauge()` in Go). Upgrading drops settings no widget reads (`decimals`, `placeholder`, `imageFit`) and a top-level `users` list, each with a note. `speths-screens upgrade [-o out] <file>` upgrades a file (keeping `<file>.bak` when rewriting it in place); `demo.xhmi.json` and `project/project.example.json` are v2. Step 5: the IDE binds `ns:` paths wherever the namespace has the variable and adds a PLC variable to the namespace in one step (`store/tagPaths.ts`); the project's namespace is the source of truth and a reachable runtime is told at once. Step 6 (Dan, 2026-10-24): widget presets live in the project (`presets`: id, name, description, one or more ordinary widgets positioned from 0,0, in the project's canvas units); inserting one copies its widgets with new ids (groups get a new group id), with settings, tags and events kept and no link back; the runtime validates presets but neither polls nor allows writes for their tags; built-in presets ship in `packages/widgets/src/presets.ts` (grid units). Switching grid/pixel converts presets too. Step 7 (Dan, 2026-10-24): the HTML export is a static snapshot (`ide/src/store/exportHtml.tsx`): every page drawn by the shared library with `react-dom/server` (loaded only on export), the IDE's CSS and theme inlined, each widget showing the value the IDE had, no scripts. The live export was dropped: since defect 9 a file page (origin `null`) is refused by the WebSocket origin check and CORS and cannot log in; the operator screen is the live view.

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
8. ~~`api.handleWriteTag` checks nothing. Build the write pipeline: tag must exist in the project and be writable; the user's role must allow it; convert the value to the tag's PLC type; apply limits; write; read back; reply confirmed or failed with a reason. Offer it over the WebSocket with a request id too. In the operator app, replace the three write call sites (`src/App.tsx`, `src/writeContext.ts`, `src/widgets/index.tsx`) with one client function.~~ Done.
9. ~~Security defaults (Dan's decision, 2026-10-23): login is set per project by `security.mode`. `none` (the default when missing) means no login: print a warning at startup and show a "Security off" badge on the operator screen. `login` means every user must log in. Restrict CORS to configured origins (today `*`). Check the WebSocket origin (today `InsecureSkipVerify: true`).~~ Done (see the defect 9 decisions above; the sub-items below are done too).
    - Project `users` hold bcrypt `passwordHash` values, never plain text. How they relate to the runtime's `security.db` users (managed by the IDE Users panel through `/api/v1/users`) is open; ask Dan before building it.
    - With `security.mode: "login"`, replace the fixed first-run `admin`/`admin` user (July WIP, `cmd/speths-screens/main.go`) with a random first-run password shown once on the console, never written to log files, and force a password change at first login. With `none`, seed no user.
    - Dev mode (`--mode=dev`, which bypasses login) listens on `127.0.0.1` only.
    - Add tests for the dev-mode login bypass and for first-run user creation.
10. ~~Alarm events (`internal/alarms/alarms.go`, send to subscribers) and the event bus (`internal/eventbus/eventbus.go`) drop events for slow subscribers. These are discrete events, so "newest value wins" is wrong; use a bounded per-client queue and, on overflow, tell the client to re-fetch the alarm snapshot.~~ Done. Also fixed: `/ws/alarms` lost changes between its snapshot and subscription; the alarm-history writer subscribed late and could miss start-up changes; `SubscribeAll` leaked goroutines; both endpoints now read from the client.

## Later phases (one line each)

- **Phase 2 — widgets and project model:** one `packages/widgets` library used by both apps, a manifest per widget that drives the property panel, schema v2 widget format (`props`, `bindings`, `events`), `ns:` tag paths, templates, and an upgrader for v1 projects.
- **Phase 3 — dynamics and look:** any bindable property driven by a tag or expression through one transform; one JavaScript-syntax expression language without `eval`; design tokens; a high-performance (ISA-101 style) default theme; a widget gallery.
- **Phase 4 — scripting and local variables:** goja runtime scripts, Web Worker screen scripts, one typed API with Monaco autocomplete, typed memory tags (optionally retained), session variables.
- **Phase 5 — product:** installer, licensing, documentation, simulation mode, and AI screen-building tools on the MCP server.
