# Memory variables on every widget type: end to end

Two scripts that use a real runtime and a real browser (Chrome, driven over the DevTools protocol). Nothing is mocked.

| Script | What it checks |
| --- | --- |
| `run.mjs` | Deploys a project with a memory variable for each widget type, then changes each variable (through the runtime's API, or by operating the widget on the operator screen when it is an input) and checks the value on the runtime **and** on the screen. |
| `ide-flow.mjs` | The authoring path through the IDE: name a memory variable in the namespace, add a Button and a Numeric display, drag the variable from the left panel onto each, optionally make the button increment, deploy, and use the button on the operator screen. |

## How each widget type uses a variable

| Widget types | Binding the test uses |
| --- | --- |
| numeric display, text display, LED, gauge, tank, multi-state, history log | the widget's value tag |
| table, trend | a row or a pen naming the variable |
| numeric input, text input, setpoint | the value tag, written by operating the widget (keypad, typing, slider) |
| button | increment, toggle and write actions on the variable |
| recipes | a recipe whose entries write two variables |
| custom widget | a parameter that names a variable |
| alarm banner | an alarm rule whose expression reads a variable |
| symbol, pipe | a driven property (animate, flow) |
| image, page list, clock, driver status, user menu, and the above once more | the widget's visibility tag (it appears and goes with the variable) |

## Running them

Start a runtime from nothing (a runtime that was running before holds old variables), from a scratch folder so its database files do not land in the repo:

```powershell
npm run build --workspace=packages/operator      # the runtime serves this build; restore cmd/speths-screens/ui/index.html afterwards
go build -o speths-screens.exe ./cmd/speths-screens
mkdir scratch; cd scratch
..\speths-screens.exe --mode=runtime --addr=127.0.0.1:8080 --history=:memory: --memory-db=m.db
```

Then, from the repo root:

```powershell
node scripts/e2e/memory-widgets/run.mjs            # every widget type: 50 checks
```

`ide-flow.mjs` needs the IDE as well (`npm run dev`, with `VITE_RUNTIME_ADDR` pointing at the runtime if it is not on the default port):

```powershell
$env:IDE = "http://localhost:5173"; $env:RUNTIME = "http://127.0.0.1:8080"
node scripts/e2e/memory-widgets/ide-flow.mjs --increment
```

Set `CHROME` to another Chromium if Chrome is not in its usual place on Windows, and `E2E_SHOTS` for where screenshots go (default: a `speths-e2e-shots` folder in the temp directory).

## What it found

- A memory variable added by a **second deploy** could not be written (`memory: no tag "…"`): the runtime kept the memory datasource it already had. `run.mjs` ends with this check, so it fails until that is fixed.
- A new Button is **momentary** (it writes 1 while pressed and 0 on release), so bound to a variable it never counts. To count, replace those actions with On click → Increment (the `--increment` flag of `ide-flow.mjs` does this).
