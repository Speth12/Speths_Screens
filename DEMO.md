# Speth's Screens Demo — Pump Station

> **Date:** 2026-05-08  
> **Target:** Phoenix Contact AXC F 3152 at `192.168.88.10`  
> **Runtime port:** `:8080`  |  **IDE port:** `:5173`

---

## Quick Start (dev machine)

```bash
# 1. Start everything (runtime + IDE + operator dev servers)
npm run dev:all
# Opens: IDE @ http://localhost:5173  |  Operator @ http://localhost:7001

# 2. Load the demo project in the IDE
#    Click "⚙ Demo" in the IDE header
#    → 3 pages, 11 virtual tags, 4 alarm rules, 3 recipes

# 3. Deploy to local runtime
#    Click "Deploy" in the IDE header
#    → IDE proxies to http://localhost:3001

# 4. Open the operator
#    Click "⬡ Preview" in the IDE header (opens localhost:7001)
```

---

## Deploy to PLCnext AXC F 3152

```bash
# Build ARM64 binary + deploy (SCP + restart)
make deploy-plc PLC_HOST=admin@192.168.88.10

# First time: install as a systemd service
make install-service PLC_HOST=admin@192.168.88.10

# Operator URL after deployment
open http://192.168.88.10:8080
```

---

## Demo Flow (10-minute script)

### 1 — IDE tour (2 min)

| Step | Action |
|---|---|
| Load demo | Click **⚙ Demo** → project loads (3 pages, 11 tags) |
| Canvas | Point out gauge, trend, multiState, tank widgets animating live |
| Properties | Click a gauge → show config (label, min/max, thresholds) |
| Tag Browser | Hover over a tag row — shows live value updating |
| Drag & drop | Drag a tag from Tag Browser onto a widget → binding changes |
| Add widget | Drag "Gauge" from palette → drops below existing widgets |
| Keyboard | Press **?** → show shortcut reference |

### 2 — Deploy & operator (3 min)

| Step | Action |
|---|---|
| Deploy | Click **Deploy** → "deployed → local" confirmation |
| Open operator | Click **⬡ Preview** → operator opens in new tab |
| Live gauges | Show pressure + temp gauges sweeping in real-time |
| Alarm fires | Wait for pressure > 60 bar → alarm banner appears (red pulse) |
| Acknowledge | Click **ACK** in the banner |
| Alarm log | Click **🔔 Alarm Log** → show full event history |

### 3 — Recipes (2 min)

| Step | Action |
|---|---|
| Open recipes | Click **⚙ Recipes** in operator header |
| Normal → High Demand | Click **Apply Recipe** on "High Demand" |
| Show effect | Pressure setpoint jumps → alarm fires sooner |
| Standby | Apply "Standby" → flow drops, pumps show STOPPED |

### 4 — PLC deploy (3 min)

```bash
make deploy-plc PLC_HOST=admin@192.168.88.10
```

| Step | Action |
|---|---|
| Change target | In IDE header, select "PLC / custom…", enter PLC IP |
| Live OPC UA | Tag Browser shows real PLCnext tags (if server running) |
| Deploy | Click **Deploy** → project pushed to PLC at :8080 |
| Operator | Open `http://192.168.88.10:8080` on phone/tablet |

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Dev Machine                                                    │
│                                                                 │
│  ┌──────────────┐     deploy      ┌─────────────────────────┐  │
│  │  Speth's Screens IDE   │ ─────────────► │  Speth's Screens Runtime (Go)     │  │
│  │  Vite :5173  │                │  :3001 (dev) / :8080 PLC│  │
│  └──────────────┘                │                           │  │
│                                  │  ┌─────────┐ ┌────────┐  │  │
│  ┌──────────────┐   WebSocket    │  │ Virtual │ │ OPC UA │  │  │
│  │  Operator    │ ◄────────────  │  │ Sim DS  │ │ Driver │  │  │
│  │  Vite :7001  │    tags/alarms │  └─────────┘ └────────┘  │  │
│  └──────────────┘                │  Historian (SQLite WAL)   │  │
│                                  └──────────┬────────────────┘  │
└─────────────────────────────────────────────│────────────────────┘
                                              │ SCP
                                    ┌─────────▼─────────┐
                                    │  AXC F 3152       │
                                    │  ARM64 / :8080    │
                                    │  Yocto Linux      │
                                    └───────────────────┘
```

---

## Key Commands

```bash
npm run dev:all        # Start all dev servers concurrently
make build-plc         # Cross-compile ARM64 binary
make deploy-plc        # Build + deploy to PLC
make test              # Run Go tests
make test-race         # Run with race detector
go test ./... -v       # Verbose Go tests
```

---

## Ports

| Service | Dev port | PLC port |
|---|---|---|
| Runtime API | 3001 | 8080 |
| IDE (Vite) | 5173 | — |
| Operator (Vite dev) | 7001 | 8080 |
| OPC UA (PLC) | — | 4840 |

---

## Widget Reference

| Widget | Type key | Description |
|---|---|---|
| Gauge | `gauge` | SVG needle gauge with threshold arcs |
| Numeric Display | `numericDisplay` | Large value + quality indicator |
| LED | `led` | Boolean indicator with custom colors |
| Multi-State | `multiState` | Maps discrete values to labels/colors |
| Tank | `tank` | Vertical level bar with fill color |
| Trend | `trend` | Multi-series polyline with time window picker |
| History Log | `historyLog` | Scrollable table + CSV export |
| Button | `button` | Momentary or toggle write control |
| Setpoint | `setpoint` | Slider write with confirmation dialog |
| Numeric Input | `numericInput` | Inline editable number with write confirm |
| Text Input | `textInput` | Inline editable text with write confirm |
| Text Display | `textDisplay` | Read-only string value |

---

## Simulated Tag Reference

All tags are in the `sim` datasource. Phase updates at 5 Hz.

| Tag | Formula | Range |
|---|---|---|
| `pressure` | `50 + sin(phase) × 15` | 35–65 bar |
| `temperature` | `65 + cos(phase) × 8` | 57–73 °C |
| `flow` | `clamp(30 + sin(phase×1.3) × 20, 0, 100)` | 10–50 m³/h |
| `level` | `clamp(60 + sin(phase×0.7) × 25, 0, 100)` | 35–85 % |
| `pump1_running` | `if(sin(phase) > -0.3, 1, 0)` | 0 or 1 |
| `pump2_running` | `if(cos(phase) > 0, 1, 0)` | 0 or 1 |
| `fault_active` | `if(pressure > 62, 1, 0)` | 0 or 1 |
| `pressure_psi` | `pressure × 14.504` | 508–943 psi |
| `temp_f` | `temperature × 9/5 + 32` | 135–163 °F |
| `efficiency` | `map(flow, 0, 100, 45, 92)` | 50–74 % |

---

## Alarm Rules

| Rule | Condition | Severity |
|---|---|---|
| High Pressure | pressure > 60 bar | ⚠ Warning |
| Critical Pressure | pressure > 70 bar | 🔴 Critical |
| High Temperature | temperature > 72 °C | ⚠ Warning |
| Low Tank Level | level < 20 % | 🔴 Critical |
