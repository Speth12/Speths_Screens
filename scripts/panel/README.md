# Trying Speth's Screens on a Phoenix Contact WP 6000 panel

> The step-by-step install, update and troubleshooting are in the [install guide](../../docs/install.md#4-install-on-a-wp-6000-panel). This page holds the panel scripts and what was measured on a WP 6101.

Tools used on 2026-11-05 and 2026-11-06 to find out whether the runtime can run on a WP 6101 and show
its own screen. The findings are in `CLAUDE.md` ("WP 6000 panel test").

| File | Run it | What it does |
| --- | --- | --- |
| `browser-check.html` | Open it in the panel's browser (serve it from a PC, or copy it to the panel and open `file:///…`) | Reports the browser version, whether it supports what the operator screen needs, and a rough speed test. Sends nothing anywhere. |
| `probe.sh` | On the panel: `sh probe.sh > panel-probe.txt 2>&1` | Read-only facts: architecture, OS, memory, storage, services, tools, network. Changes nothing. |
| `run-test.sh` | On the panel, in the folder with the binary and a project: `sh run-test.sh [project]` | Runs the runtime in the foreground on `127.0.0.1:8090` with history in memory. Ctrl+C stops it. |
| `install-service.sh` | On the panel, same folder: `sh install-service.sh [project]` | Installs a systemd **user** service so the runtime starts at boot, and restarts it. Run it again with another project to switch. |
| `uninstall-service.sh` | On the panel | Removes that service. |

## Build the test package

```sh
npm run build --workspace=packages/operator
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "-s -w" -o speths-screens ./cmd/speths-screens
```

Put `speths-screens`, a project (for example `samples/design-directions.screens.json`) and the three scripts in one
folder on the panel (`/home/admin/panel-test` was used), then run `install-service.sh`. Point the panel's
Web application URL at `http://localhost:8090/?perf` to show the screen and the perf readout.

## Deploying from the IDE on your PC (lab use, no login)

By default the runtime listens on the panel only, so the IDE cannot reach it. To let your PC's IDE connect:

1. On the panel: `SPETHS_LISTEN=:8090 sh install-service.sh` (or `SPETHS_LISTEN=:8090 sh run-test.sh` for a test run).
2. On your PC, check it answers (200 means it does; use the panel's address). In PowerShell, where `curl` means something else: `(Invoke-WebRequest http://10.0.0.118:8090/ -UseBasicParsing).StatusCode`. In a shell with real curl: `curl -s -o /dev/null -w "%{http_code}
" http://10.0.0.118:8090/`.
3. In the IDE, open the target gear, add a target `http://10.0.0.118:8090`, select it, then Deploy or Pull. The IDE run with `npm run dev` is already an allowed origin; another address needs `--cors-origins`.
4. To close it again: `sh install-service.sh` with no `SPETHS_LISTEN`.

**This has no login** unless the project turns security on: anyone who can reach the panel can deploy a project to it, write to its tags and read everything. Use it only on a network you trust. The panel's own firewall rules (`iptables`) have not been looked at; if step 2 fails, that is the first place to look.

## Things to know

- **Never commit `panel-probe.txt`.** It holds the panel's network addresses and hardware address. It is git-ignored.
- Port 8080 on the panel belongs to its own settings app, so the runtime uses 8090.
- `/tmp` and `/var/volatile` on the panel are RAM. Keep data on the root disk.
- The scripts must keep Unix line endings.
- The runtime listens on `127.0.0.1` only, so nothing on the network can reach it. Letting an IDE on a PC deploy to it
  would need an inbound firewall rule on the panel, which has not been looked at.
