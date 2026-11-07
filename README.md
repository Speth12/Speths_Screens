# Speth's Screens

Speth's Screens is a web-based HMI platform for Phoenix Contact PLCnext controllers.

- **Runtime:** one Go binary. It talks to PLCs (PLCnext REST, OPC UA, Modbus TCP, MQTT, calculated tags), keeps the tag values, runs alarms, the historian, logins and the API, and serves the operator screen.
- **IDE:** a React app in the browser where screens are designed and deployed to a runtime.
- **Operator screen:** a React app in the browser, served by the runtime.
- **Project:** one JSON file (`.screens.json`), validated by `schema.json`.

## Build, run and test

```powershell
go vet ./...
go test ./...
npm ci
npm run build
npm test --workspace=packages/ide -- --run

go run ./cmd/speths-screens --mode=dev --project=demo.screens.json   # runtime on :3001
npm run dev                                              # IDE on :5173
npm run dev:operator                                     # operator on :7001
```
