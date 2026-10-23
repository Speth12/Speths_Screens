# Speth's Screens Competitive Analysis

**Date:** 2026-05-04  
**Analyst:** Generated via Claude Code (claude-sonnet-4-6)

---

## Competitor Landscape Summary

| Platform | Vendor | Tier | Key Strength | Typical Price |
|---|---|---|---|---|
| **Ignition** | Inductive Automation | Enterprise / Mid-Market | Unlimited clients/tags, Python scripting, huge ecosystem | ~$8K–$30K+ site license |
| **AVEVA System Platform** | AVEVA (Schneider) | Enterprise | ArchestrA object model, deep historian, large-scale SCADA | $50K–$500K+ |
| **Kepware** | PTC / Kepware | Connectivity layer | 150+ PLC drivers, OPC-DA/UA gateway (not a full HMI) | $1K–$5K per server |
| **WinCC** | Siemens | Mid / Enterprise | TIA Portal integration, Siemens-shop dominance | $3K–$50K+ |
| **FactoryTalk View** | Rockwell Automation | Mid / Enterprise | Allen-Bradley ecosystem lock-in, reliable, mature | $5K–$30K+ |
| **Clarity** | Phoenix Contact | IIoT / Cloud | PLCnext-native, cloud dashboards, low friction for PLCnext shops | Subscription |

### Competitive Position of Speth's Screens (current state)

**Advantages over all incumbents:**
- Zero-cost open/custom deployment on PLCnext hardware (Clarity is subscription; others are expensive)
- Go runtime is tiny and fast — starts in <2s, works on ARM
- React IDE delivered over HTTP — no thick-client install
- Already has OPC UA + Modbus + MQTT + REST — covers the PLCnext data plane
- Alarm system with WebSocket push is on par with or ahead of WinCC at the same stage
- Drag-and-drop layout + property editor — competitive IDE UX foundation

**Critical gaps vs. all incumbents (drives the priority list below):**
- No multi-screen navigation (fatal for any real deployment)
- No authentication / RBAC (disqualifying for industrial security audits)
- No tag database (all logic hardcodes driver paths)
- No expression/calculated tags (forces workarounds or PLC-side logic)
- Driver coverage is narrow (no EtherNet/IP, S7, PROFINET IO, BACnet) — EtherNet/IP, S7, and PROFINET are targeted as post-v1.0 plugins; BACnet ships in v1.0
- No data historian (query window exists but no write-to-storage engine)
- No symbol library (every project starts from blank canvas)
- No scripting engine (Ignition's Python and WinCC's C# are major differentiators)

---

## Top 15 Features Speth's Screens Should Add

**Priority Score** = Competitive Need ÷ Effort multiplier (S=1, M=2, L=3).  
Higher score = ship first.

| # | Feature | Competitive Need (1–5) | Effort (S/M/L) | Priority Score | Notes |
|---|---|:---:|:---:|:---:|---|
| 1 | **Multi-Screen Navigation** | 5 | S | **5.00** | Without screen linking, projects are single-page toys. Every competitor has hierarchical screen trees, popup windows, and navigation buttons. Implement: screen registry in the project JSON, a Navigator widget, and a router in the React canvas. Weeks of work, non-negotiable. |
| 2 | **User Authentication & RBAC** | 5 | S | **5.00** | Industrial deployments require login before any operator can touch a setpoint. All six competitors ship role-based access (Admin / Operator / Viewer minimum). Session tokens via the existing Go HTTP server; roles stored in project config. Blocks enterprise sales without this. |
| 3 | **Industrial Symbol Library** | 4 | S | **4.00** | Ignition, WinCC, and FactoryTalk all ship hundreds of pre-built SVG symbols (pumps, valves, tanks, conveyors, motors). Engineers expect to drag a pump onto canvas in seconds. Curate ~100 open-license ISA-5.1 symbols as a bundled asset pack — high ROI for low effort. |
| 4 | **SVG / Custom Graphics Import** | 3 | S | **3.00** | Engineers import P&ID diagrams, floor plans, and OEM graphics. Ignition, AVEVA, and WinCC all support SVG embedding with tag-bound dynamic properties (fill color, visibility, rotation). Add an SVG widget that accepts a file path and exposes CSS property bindings to tag values. |
| 5 | **Tag Database with Engineering Units** | 5 | M | **2.50** | All mature platforms abstract device addresses behind a named tag database (deadband, scale, EU label, description). Without it, every widget re-reads raw driver paths. A central tag store enables cross-widget sync, expression tags, and alarms referencing named values rather than raw addresses. |
| 6 | **Expression / Calculated Tags** | 5 | M | **2.50** | Real-world displays require `(raw_value * scale) + offset`, unit conversions, boolean logic, and aggregations. Ignition uses Python expressions; WinCC uses scripted tags. Implement a safe expression evaluator (e.g., `govaluate` or a small AST engine) with tag name references. Depends on Tag Database (#5). |
| 7 | **EtherNet/IP Driver (Allen-Bradley)** ⚡ *Post-release plugin* | 4 | M | **2.00** | Rockwell PLCs dominate North American manufacturing. Kepware's top driver by volume. Ships as a post-v1.0 plugin (Oct 2026) to avoid hardware testing bottleneck on the v1.0 critical path. Use `libplctag` via CGo. Required for North American market. |
| 8 | **Siemens S7 / ISO-on-TCP Driver** ⚡ *Post-release plugin* | 4 | M | **2.00** | S7-300/400/1200/1500 are the global PLC standard outside North America. Ships as a post-v1.0 plugin (Nov 2026). Use `go-s7` or wrap `libnodave`. Required to be taken seriously in EU/Asian markets. |
| 9 | **Report Generation (PDF / CSV Export)** | 4 | M | **2.00** | Operators and managers expect shift reports, alarm summaries, and trend exports. Ignition, FactoryTalk, and AVEVA all include report designers. Start with scheduled CSV export of historian data and alarm log; add PDF via `chromedp` headless render or a Go PDF library. |
| 10 | **Mobile / Responsive Viewer Mode** | 4 | M | **2.00** | Ignition Perspective is mobile-first and it is a major differentiator vs. legacy Vision. Clarity is also cloud/mobile-first. Add a "viewer" build of the React app with responsive breakpoints and read-only touch controls. Separate from the IDE — same runtime, different shell. |
| 11 | **Audit Trail & Electronic Operator Log** | 4 | M | **2.00** | ISA-18.2 alarm management and FDA 21 CFR Part 11 both require immutable audit records of who changed what and when. All enterprise platforms ship this. Append-only SQLite log of setpoint writes, alarm ACKs, and login events. Expose as a filterable table widget. |
| 12 | **Data Historian (Time-Series Storage)** | 5 | L | **1.67** | Ignition's Tag Historian is its most-sold module. AVEVA's historian is the backbone of its product. Speth's Screens has a history log widget but no write path. Add periodic tag sampling to SQLite (or InfluxDB via HTTP) with configurable rate and retention. Prerequisite for trend replay beyond live window. |
| 13 | **Redundancy / Hot-Standby Runtime** | 5 | L | **1.67** | Enterprise SCADA requires HA. Ignition supports redundant gateway pairs; AVEVA has N+1 server redundancy. For PLCnext this could be two Speth's Screens nodes with a shared project file and a VIP address. Requires heartbeat, state sync, and client failover. High need but high effort. |
| 14 | **Recipe Management** | 3 | M | **1.50** | Batch and process industries (food & bev, pharma, chemicals) require recipe-driven setpoint sets. Ignition and FactoryTalk both have recipe modules. Implement as named parameter sets that can be downloaded to a set of tags in one operation. High value in target verticals. |
| 15 | **Scripting Engine (Lua or WASM sandbox)** | 4 | L | **1.33** | Ignition's embedded Python is its biggest differentiator for complex logic. WinCC uses C# scripts. A safe Lua sandbox (via `gopher-lua`) or WASM-isolated JS would enable event-driven logic (on tag change, on alarm, on timer) that currently must live in the PLC. Critical for long-term platform depth. |

---

## Scoring Methodology

```
Priority Score = Competitive Need / Effort Multiplier
Effort Multiplier: S (Small, ~1 week) = 1 | M (Medium, ~1 month) = 2 | L (Large, ~3 months) = 3
```

**Competitive Need rubric:**
- **5** — All six competitors have it; missing it loses deals immediately
- **4** — Most competitors have it; missing it is a notable objection
- **3** — Some competitors have it; nice-to-have in many verticals
- **2** — Few competitors have it; differentiator if you add it
- **1** — Niche; adds value in specific use cases only

---

## Recommended Phased Roadmap

### Phase 1 — Demo-Viable (ship in 2–4 weeks)
Items #1, #2, #3, #4 — Multi-screen navigation, Auth/RBAC, Symbol Library, SVG Import.  
After Phase 1, Speth's Screens can be demonstrated to a real plant without embarrassment.

### Phase 2 — Pilot-Ready (ship in 3 weeks)
Items #5, #6, #11 — Tag Database, Expressions, Audit Trail.  
After Phase 2, Speth's Screens can run a paid pilot at a PLCnext customer site (OPC UA covers most PLCnext-native data; EtherNet/IP and S7 arrive as post-release plugins).

### Phase 3 — Market-Ready (ship in 5.5 weeks)
Items #9, #10, #12, #13 — Reports, Mobile Viewer, Historian, Redundancy.  
After Phase 3, Speth's Screens can displace Clarity and compete seriously against Ignition in PLCnext shops.

### Phase 4 — v1.0 (ship in 7 weeks)
Items #14, #15 — Recipe Management, Scripting Engine, GDS Binding, Git-native format, WASM Plugin API.  
These unlock vertical markets and establish the plugin infrastructure that EtherNet/IP, S7, and PROFINET ship through.

### Post-Release Plugins (Oct–Nov 2026)
EtherNet/IP, S7, PROFINET IO — each ships ~3 weeks after the previous, hardware-tested independently.

---

## Competitive Moat Opportunities

Areas where Speth's Screens could **leapfrog** competitors rather than just catch up:

1. **Native PLCnext GDS binding** — Read PLCnext Global Data Space directly (no OPC UA middleman). Faster, lower latency, zero configuration. No competitor matches this on PLCnext hardware — not even Clarity.
2. **Git-native project format** — Store `.xhmi.json` in a Git repo. Version control, branching, diff/merge of HMI projects. No incumbent supports this properly; it is a major pain point for engineering teams.
3. **WASM widget plugins** — Let users write custom widgets compiled to WASM. More sandboxed and portable than Ignition's Java modules or WinCC's ActiveX.
4. **Edge-AI anomaly detection widget** — Bundle a simple ONNX runtime to run a pre-trained anomaly model on tag streams. No competitor ships this out of the box on edge hardware.
