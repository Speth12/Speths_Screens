# Trying Speth's Screens on a Phoenix Contact WP 6000 panel

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

## Things to know

- **Never commit `panel-probe.txt`.** It holds the panel's network addresses and hardware address. It is git-ignored.
- Port 8080 on the panel belongs to its own settings app, so the runtime uses 8090.
- `/tmp` and `/var/volatile` on the panel are RAM. Keep data on the root disk.
- The scripts must keep Unix line endings.
- The runtime listens on `127.0.0.1` only, so nothing on the network can reach it. Letting an IDE on a PC deploy to it
  would need an inbound firewall rule on the panel, which has not been looked at.
