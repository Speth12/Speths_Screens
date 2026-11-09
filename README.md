# Speth's Screens

A web-based HMI platform for Phoenix Contact PLCnext controllers: design screens in a browser, deploy them to a small
runtime, and operate them from any browser, including the panel's own screen.

- **Runtime:** one Go program with no dependencies to install. It talks to PLCs (PLCnext REST, OPC UA, Modbus TCP,
  MQTT, calculated tags), keeps tag values, runs alarms, the historian, logins and scripts, and serves the operator
  screen. Runs on Windows, Linux and the WP 6000 web panel (Linux ARM64).
- **IDE:** a React app in the browser where screens are designed and deployed to a runtime: your own canvas, 23 widget
  types, custom widgets, tablet and phone layouts, trends, alarms, recipes, scripting, themes and languages.
- **Operator screen:** what operators see, read-only for design, served by the runtime.
- **Project:** one JSON file (`<name>.screens.json`), validated by [`schema.json`](schema.json).

## Get started

| I want to | Go to |
| --- | --- |
| Run it on my PC and look at a demo | [Install guide, section 2](docs/install.md#2-run-the-runtime-on-a-pc) |
| Design screens | [Install guide, section 3](docs/install.md#3-run-the-ide) |
| Put it on a WP 6000 panel | [Install guide, section 4](docs/install.md#4-install-on-a-wp-6000-panel) |
| Connect it to a PLCnext controller | [Install guide, section 6](docs/install.md#6-connect-to-a-plc) |
| Fix something that does not work | [Troubleshooting](docs/install.md#9-troubleshooting) |

Downloads (Windows, Linux, the panel package, sample projects, checksums) are on the
[Releases](https://github.com/Speth12/Speths_Screens/releases) page.

Sample projects (in [`samples/`](samples/) and `demo.screens.json`): a pump station overview in three visual styles, a
feature tour that uses every widget and dynamic, and a demo that reads and writes a real PLC and runs scripts on it.

## Build from source, run and test

Needs [Go 1.25](https://go.dev/dl/) and [Node.js 22](https://nodejs.org/).

```powershell
go vet ./...
go test ./...
npm ci
npm run build
npm run lint
npm test --workspace=packages/ide -- --run      # and the other workspaces: see CLAUDE.md

go run ./cmd/speths-screens --mode=dev --project=demo.screens.json   # runtime on :3001
npm run dev                                                          # IDE on :5173
npm run dev:operator                                                 # operator screen on :7001

node scripts/release/build.mjs --version=v0.8.0                      # release files into dist/
```

How the code is organized, the rules for changing it, and what each phase decided are in [`CLAUDE.md`](CLAUDE.md).

## Security

Without a login a runtime lets anyone who can reach it deploy a project and write to the PLC's tags. Keep it on a
closed network or turn on logins ([Install guide, section 7](docs/install.md#7-security-and-logins)). Never commit
passwords, tokens, keys or `project/project.json`.
