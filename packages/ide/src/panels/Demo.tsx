import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "../store/runtimeTarget";

// ── Types ──────────────────────────────────────────────────────────────────

type Group = "runtime" | "ide";

type FeatureMeta = {
  id: string;
  title: string;
  group: Group;
  icon: string;
  tagline: string;
  accentColor: string;
  what: string;
};

const RUNTIME_FEATURES: FeatureMeta[] = [
  {
    id: "namespace", group: "runtime", icon: "⊛",
    title: "Unified Namespace", tagline: "One address for every protocol",
    accentColor: "#3b82f6",
    what: "Every tag from every driver lives at a dot-separated path. OPC UA, Modbus, MQTT, and virtual tags coexist in one tree.",
  },
  {
    id: "expr", group: "runtime", icon: "ƒ",
    title: "Expression Engine", tagline: "Virtual tags computed from real tags",
    accentColor: "#f59e0b",
    what: "Define Plant.TempF = Average({opc1:T1},{opc1:T2})*1.8+32 — auto-updates whenever any dependency changes.",
  },
  {
    id: "eventbus", group: "runtime", icon: "⇆",
    title: "Event Bus", tagline: "Typed pub/sub decoupling all modules",
    accentColor: "#06b6d4",
    what: "Any subsystem publishes; any subscriber reacts — no import cycles, no polling, no shared mutable state.",
  },
  {
    id: "security", group: "runtime", icon: "⊠",
    title: "Security & Auth", tagline: "JWT · RBAC · bcrypt · dev passthrough",
    accentColor: "#ef4444",
    what: "Four roles from Operator to Admin. Every route is permission-checked. No security DB = full dev mode.",
  },
  {
    id: "historian", group: "runtime", icon: "◷",
    title: "Historian", tagline: "Pluggable time-series with SQLite + memory",
    accentColor: "#10b981",
    what: "Record every tag change. Query raw samples or time-bucketed aggregates (min/avg/max). CSV export included.",
  },
  {
    id: "assets", group: "runtime", icon: "◈",
    title: "Asset Model", tagline: "Physical objects with template inheritance",
    accentColor: "#f97316",
    what: "Define motor once. Inherit into vfd-motor. Instantiate as Plant.Line1.PumpA — NS paths auto-published.",
  },
  {
    id: "faceplate", group: "runtime", icon: "◉",
    title: "Faceplate Framework", tagline: "Per-asset popup views · variable substitution",
    accentColor: "#a78bfa",
    what: "One overview faceplate for all pump instances. {{.Tags.RunStatus}} resolves to the real path per instance.",
  },
  {
    id: "recipe", group: "runtime", icon: "≡",
    title: "Recipe Engine", tagline: "Batch writes · versioning · approval workflow",
    accentColor: "#22d3ee",
    what: "Operators request a recipe. Supervisors approve. Every run is immutably logged with who, when, and results.",
  },
  {
    id: "wiring", group: "runtime", icon: "∞",
    title: "Runtime Wiring", tagline: "All 11 stores in one zero-copy struct",
    accentColor: "#84cc16",
    what: "Optional stores are nil in dev mode — handlers return 503 gracefully, not panics.",
  },
  {
    id: "api", group: "runtime", icon: "⌁",
    title: "REST API", tagline: "JWT-protected routes for every subsystem",
    accentColor: "#e879f9",
    what: "11 route groups, 40+ endpoints. Permission middleware per route. Dev mode skips auth automatically.",
  },
];

const IDE_FEATURES: FeatureMeta[] = [
  {
    id: "canvas", group: "ide", icon: "⬡",
    title: "Canvas Editor", tagline: "Drag-drop layout · resize · multi-page",
    accentColor: "#60a5fa",
    what: "Place any widget type onto a grid, resize with corner handles, copy/paste across pages, zoom with Ctrl+Scroll.",
  },
  {
    id: "tagbrowser", group: "ide", icon: "⊞",
    title: "Tag Browser", tagline: "Browse by source or UNS tree · drag to bind",
    accentColor: "#8b5cf6",
    what: "Two modes: per-driver protocol browse with live values, and the full UNS tree with search and lazy expansion.",
  },
  {
    id: "properties", group: "ide", icon: "⊟",
    title: "Properties Panel", tagline: "Per-widget config · binding · thresholds",
    accentColor: "#34d399",
    what: "Click any widget to set its tag binding, label, color thresholds, display format, and layout parameters.",
  },
  {
    id: "alarms-ide", group: "ide", icon: "⚑",
    title: "Alarms Panel", tagline: "Live stream · acknowledge · history",
    accentColor: "#f87171",
    what: "Active alarms stream over WebSocket. One-click acknowledge. History tab for cleared and acked events.",
  },
  {
    id: "recipes-ide", group: "ide", icon: "▶",
    title: "Recipes Panel", tagline: "Apply recipes · track approvals from the IDE",
    accentColor: "#fb923c",
    what: "Runtime recipes surface here. Apply directly or submit for approval. Run history visible inline.",
  },
  {
    id: "deploy", group: "ide", icon: "⬆",
    title: "Deploy Workflow", tagline: "Multi-target push · pull · save · themes",
    accentColor: "#c084fc",
    what: "Add unlimited runtime targets. Push your project JSON. Pull back what's running. Save or load from disk.",
  },
];

const ALL_FEATURES = [...RUNTIME_FEATURES, ...IDE_FEATURES];

// ── Shared UI components ───────────────────────────────────────────────────

function GroupBadge({ group }: { group: Group }) {
  return group === "runtime"
    ? <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border bg-blue-950 text-blue-400 border-blue-800 font-medium">runtime</span>
    : <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border bg-violet-950 text-violet-400 border-violet-800 font-medium">ide</span>;
}

function Pill({ label, color = "#3b82f6" }: { label: string; color?: string }) {
  return (
    <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full border mr-1 mb-1"
      style={{ borderColor: color + "55", color, background: color + "15" }}>
      {label}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
      {children}
    </pre>
  );
}

function LiveBox({ label, data, error, loading }: { label: string; data?: unknown; error?: string; loading?: boolean }) {
  return (
    <div className="mt-3 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-500 font-mono">{label}</span>
        {loading && <span className="text-[10px] text-zinc-600 animate-pulse">loading…</span>}
      </div>
      <div className="p-3 bg-zinc-950 text-[11px] font-mono text-zinc-300 max-h-40 overflow-auto">
        {error
          ? <span className="text-zinc-600 italic">{error}</span>
          : loading
          ? <span className="text-zinc-700">…</span>
          : data != null
          ? JSON.stringify(data, null, 2)
          : <span className="text-zinc-700">—</span>}
      </div>
    </div>
  );
}

function FeatureGrid({ items }: { items: { title: string; desc: string; icon?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {items.map(item => (
        <div key={item.title} className="rounded-lg border border-zinc-700/60 px-3 py-2.5 bg-zinc-800/40">
          {item.icon && <div className="text-base mb-1">{item.icon}</div>}
          <div className="text-[11px] font-semibold text-zinc-200 mb-0.5">{item.title}</div>
          <div className="text-[11px] text-zinc-500 leading-relaxed">{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ feature, children }: { feature: FeatureMeta; children: React.ReactNode }) {
  return (
    <div id={`demo-${feature.id}`} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden mb-6">
      {/* Card header */}
      <div
        className="px-5 py-4 border-b border-zinc-800"
        style={{ background: feature.accentColor + "10", borderLeftWidth: 4, borderLeftColor: feature.accentColor }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg leading-none" style={{ color: feature.accentColor }}>{feature.icon}</span>
              <span className="font-bold text-sm text-zinc-100">{feature.title}</span>
              <GroupBadge group={feature.group} />
            </div>
            <div className="text-[11px] text-zinc-400 mb-2">{feature.tagline}</div>
            {/* "What this enables" callout */}
            <div className="rounded-md px-3 py-2 text-[11px] text-zinc-300 leading-relaxed"
              style={{ background: feature.accentColor + "15", borderLeft: `2px solid ${feature.accentColor}55` }}>
              {feature.what}
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </div>
  );
}

function Explain({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-zinc-400 leading-relaxed">{children}</p>;
}

// ── Live fetch hook ────────────────────────────────────────────────────────

function useFetch<T>(url: string, deps: unknown[] = []) {
  const [data, setData]       = useState<T | undefined>(undefined);
  const [error, setError]     = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(undefined);
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("runtime not connected — run `go run ./cmd/speths-screens`"); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}

// ── Runtime section components ─────────────────────────────────────────────

function NamespaceSection({ feature }: { feature: FeatureMeta }) {
  const { data, error, loading } = useFetch<unknown[]>(`${apiBase}/api/v1/namespace/tree?path=`);
  return (
    <SectionCard feature={feature}>
      <Explain>
        Every tag from every protocol is published into a single hierarchical address space using
        dot-separated paths. Drivers, virtual tags, and assets all live side-by-side — operators
        see one consistent tree regardless of whether the source is OPC UA, Modbus, MQTT, or REST.
      </Explain>
      <div className="flex flex-wrap mt-1">
        {["Plant.Line1.PumpA.RunStatus", "Plant.Line1.PumpA.FlowRate", "Plant.Tank101.Level", "calc.TempF"].map(p =>
          <Pill key={p} label={p} color={feature.accentColor} />
        )}
      </div>
      <FeatureGrid items={[
        { title: "Protocol-agnostic paths", desc: "OPC UA, Modbus, MQTT, REST — all reachable at the same style of address." },
        { title: "Lazy tree loading", desc: "Children are fetched on demand. The IDE Tag Browser expands nodes as you click." },
        { title: "Full-text search", desc: "Search across all protocols simultaneously with a debounced query." },
        { title: "Auto-publish from assets", desc: "Creating an asset instance immediately registers all its tag paths in the UNS." },
      ]} />
      <Code>{`// Publish a driver tag into the UNS
rt.Namespace.PublishDriverTag(
  "Plant.Line1.PumpA.RunStatus", // NS path
  "opc1",                        // driver ID
  "ns=2;s=Pump1.Run",            // driver address
  "bool",
)`}</Code>
      <LiveBox label="GET /api/v1/namespace/tree?path= (root children)" data={data} error={error} loading={loading} />
    </SectionCard>
  );
}

function ExprSection({ feature }: { feature: FeatureMeta }) {
  const [expr, setExpr] = useState("Average(10, 20, 30) * 1.8 + 32");
  const [result, setResult] = useState<string | null>(null);

  const evaluate = useCallback(() => {
    try {
      const builtins: Record<string, (...a: number[]) => number> = {
        Average: (...a) => a.reduce((s, v) => s + v, 0) / a.length,
        Avg:     (...a) => a.reduce((s, v) => s + v, 0) / a.length,
        Min:     (...a) => Math.min(...a),
        Max:     (...a) => Math.max(...a),
        Sum:     (...a) => a.reduce((s, v) => s + v, 0),
        Abs:     (v) => Math.abs(v),
        Round:   (v) => Math.round(v),
        Sqrt:    (v) => Math.sqrt(v),
        Clamp:   (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        If:      (c, t, f) => (c ? t : f),
      };
      const replaced = expr.replace(/\{[^}]+\}/g, "42");
      const fn = new Function(...Object.keys(builtins), `return (${replaced})`);
      const r = fn(...Object.values(builtins));
      setResult(String(Math.round(r * 1000) / 1000));
    } catch { setResult("parse error"); }
  }, [expr]);

  useEffect(() => { evaluate(); }, [evaluate]);

  return (
    <SectionCard feature={feature}>
      <Explain>
        A recursive-descent parser evaluates infix expressions at runtime. Dependency tracking uses a
        dry-run pass — the engine records which tag paths are accessed, then re-evaluates whenever any
        dependency fires a change event. Circular dependencies are detected via DFS before registration.
      </Explain>
      <div className="flex flex-wrap mt-1">
        {["Average","Min","Max","Sum","If","Clamp","Abs","Round","Sqrt"].map(f =>
          <Pill key={f} label={f + "(…)"} color={feature.accentColor} />
        )}
      </div>
      {/* Live evaluator */}
      <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
        <div className="text-[11px] text-zinc-400 mb-2 font-medium">Try it — live expression evaluator</div>
        <div className="flex gap-2 items-center">
          <input
            value={expr}
            onChange={e => setExpr(e.target.value)}
            onKeyUp={evaluate}
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-[12px] font-mono text-zinc-200 focus:outline-none focus:border-amber-600"
            placeholder="Enter expression…"
          />
          <span className="text-xs text-zinc-500">=</span>
          <span className="text-sm font-mono font-bold min-w-[60px]"
            style={{ color: result === "parse error" ? "#ef4444" : "#34d399" }}>
            {result ?? "…"}
          </span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5">
          Tag refs like <code className="text-zinc-500">{"{opc1:Pump.Speed}"}</code> are replaced with 42 in this demo.
        </p>
      </div>
      <Code>{`// Register a virtual tag — re-evaluates on any dependency change
rt.Expressions.Register("Plant.TempF",
  "Average({opc1:T1}, {opc1:T2}) * 1.8 + 32",
)
// Circular dependency detection:
// A → B → A  →  error at registration time, not at runtime`}</Code>
    </SectionCard>
  );
}

function EventBusSection({ feature }: { feature: FeatureMeta }) {
  const events = [
    { type: "tag.changed",    desc: "Fires on every value update from any driver or expression",  color: "#3b82f6" },
    { type: "alarm.raised",   desc: "Alarm rule transitions active → fires once per activation",   color: "#ef4444" },
    { type: "alarm.cleared",  desc: "Alarm returns to normal",                                     color: "#10b981" },
    { type: "alarm.acked",    desc: "Operator acknowledges an active alarm",                       color: "#f59e0b" },
    { type: "recipe.applied", desc: "Recipe successfully executed — carries run ID",               color: "#8b5cf6" },
    { type: "user.login",     desc: "Successful JWT login — carries username and role",            color: "#06b6d4" },
    { type: "project.loaded", desc: "Project JSON deployed to the runtime",                        color: "#84cc16" },
  ];
  return (
    <SectionCard feature={feature}>
      <Explain>
        An in-process typed pub/sub bus decouples every runtime subsystem. Publishing and subscribing
        require no direct reference between components. Subscriptions return a <code className="text-zinc-300 text-[11px]">cancel()</code> function
        and a buffered channel — safe to cancel multiple times, zero allocation per event.
      </Explain>
      <div className="mt-2 space-y-1.5">
        {events.map(e => (
          <div key={e.type} className="flex items-start gap-3 rounded-lg px-3 py-2 bg-zinc-800/40 border border-zinc-700/40">
            <span className="font-mono text-[11px] shrink-0 mt-0.5 w-32" style={{ color: e.color }}>{e.type}</span>
            <span className="text-[11px] text-zinc-400">{e.desc}</span>
          </div>
        ))}
      </div>
      <Code>{`// Subscribe from anywhere — no import cycle needed
ch, cancel := rt.Events.Subscribe(eventbus.EventTagChanged)
defer cancel()
for ev := range ch {
    payload := ev.Payload.(eventbus.TagChangedPayload)
    fmt.Println(payload.Path, payload.Value)
}`}</Code>
    </SectionCard>
  );
}

function SecuritySection({ feature }: { feature: FeatureMeta }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginResult, setLoginResult] = useState<Record<string, unknown> | null>(null);
  const [loginError, setLoginError]   = useState("");
  const [busy, setBusy]               = useState(false);
  const whoami = useFetch(`${apiBase}/api/v1/whoami`);

  const doLogin = async () => {
    setBusy(true); setLoginResult(null); setLoginError("");
    try {
      const r = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json() as Record<string, unknown>;
      if (r.ok) setLoginResult(d); else setLoginError((d.error as string) ?? "failed");
    } catch { setLoginError("runtime not connected"); }
    setBusy(false);
  };

  const roles = [
    { role: "Operator",   color: "#06b6d4", perms: ["tag.read", "alarm.ack"] },
    { role: "Supervisor", color: "#f59e0b", perms: ["tag.read", "tag.write", "alarm.ack", "recipe.apply", "recipe.approve"] },
    { role: "Engineer",   color: "#a78bfa", perms: ["…Supervisor", "project.deploy", "assets.write"] },
    { role: "Admin",      color: "#ef4444", perms: ["…Engineer", "users.manage", "audit.read"] },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        Every <code className="text-zinc-300 text-[11px]">/api/v1</code> route is guarded by JWT middleware.
        Tokens are HS256-signed with 8-hour expiry. Passwords are bcrypt-hashed. The JWT secret is
        generated at startup and rotated on restart — set <code className="text-zinc-300 text-[11px]">--jwt-secret</code> for persistence.
      </Explain>
      <div className="mt-2 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Role hierarchy</div>
        <table className="w-full text-[11px]">
          <tbody>
            {roles.map(r => (
              <tr key={r.role} className="border-b border-zinc-800/50 last:border-0">
                <td className="px-3 py-2 font-mono font-bold w-24" style={{ color: r.color }}>{r.role}</td>
                <td className="px-3 py-2 text-zinc-400">{r.perms.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 rounded-lg border border-zinc-700 p-3 bg-zinc-800/30">
        <div className="text-[11px] text-zinc-400 mb-2 font-medium">Try it — POST /api/v1/auth/login</div>
        <div className="flex gap-2">
          <input value={username} onChange={e => setUsername(e.target.value)}
            className="w-28 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
            placeholder="username" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-28 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
            placeholder="password" />
          <button onClick={doLogin} disabled={busy}
            className="text-xs px-3 py-1 rounded bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white">
            {busy ? "…" : "Login"}
          </button>
        </div>
        {loginError  && <div className="text-[11px] text-red-400 mt-1.5">{loginError}</div>}
        {loginResult && <pre className="mt-2 text-[10px] font-mono text-emerald-400 whitespace-pre-wrap">{JSON.stringify(loginResult, null, 2)}</pre>}
      </div>
      <LiveBox label="GET /api/v1/whoami (current identity)" data={whoami.data} error={whoami.error} loading={whoami.loading} />
    </SectionCard>
  );
}

function HistorianSection({ feature }: { feature: FeatureMeta }) {
  const to   = Date.now() * 1_000_000;
  const from = (Date.now() - 60_000) * 1_000_000;
  const { data, error, loading } = useFetch(`${apiBase}/api/v1/history?path=test.tag&from=${from}&to=${to}&limit=5`);

  return (
    <SectionCard feature={feature}>
      <Explain>
        The <code className="text-zinc-300 text-[11px]">historian.Provider</code> interface abstracts storage entirely.
        Backends register themselves via <code className="text-zinc-300 text-[11px]">init()</code> side-effects — switch backends
        by changing one flag. Both ship with the binary; no extra services required.
      </Explain>
      <FeatureGrid items={[
        { icon: "🗄", title: "SQLite WAL",     desc: "Persistent, zero-dependency. Supports aggregation, retention, and multi-tag queries." },
        { icon: "⚡", title: "In-memory",      desc: "Zero-latency writes. Used in tests and scenarios without persistent storage." },
        { icon: "⊞", title: "Bucket queries", desc: "Query with 1s/1m/1h bucket aggregation — min, avg, max, count per bucket." },
        { icon: "↓", title: "CSV export",     desc: "Any history query can return CSV for spreadsheet import." },
      ]} />
      <Code>{`GET /api/v1/history
  ?path=Plant.Tank101.Level
  &from=1718000000000000000   ← nanoseconds
  &to=1718003600000000000
  &bucket=1m
  &limit=60
// → [{ts, min, avg, max, count}, …]`}</Code>
      <LiveBox label="GET /api/v1/history?path=test.tag (last 60 s, limit 5)" data={data} error={error} loading={loading} />
    </SectionCard>
  );
}

function AssetsSection({ feature }: { feature: FeatureMeta }) {
  const templates = useFetch(`${apiBase}/api/v1/assets/templates`);
  const instances = useFetch(`${apiBase}/api/v1/assets/instances`);

  const inheritance = [
    { id: "motor",     parent: null,      props: ["RunStatus", "Fault", "Current"] },
    { id: "vfd-motor", parent: "motor",   props: ["+ Speed", "+ Frequency"] },
    { id: "pump",      parent: null,      props: ["RunStatus", "Fault", "FlowRate"] },
    { id: "valve",     parent: null,      props: ["Position", "Fault"] },
    { id: "tank",      parent: null,      props: ["Level", "Volume", "Temperature"] },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        Assets model real physical equipment. Every instance is typed by a template. Templates support
        single inheritance — child properties override parent properties on name collision. Creating an
        instance with an <code className="text-zinc-300 text-[11px]">NSPath</code> + <code className="text-zinc-300 text-[11px]">TagMap</code> auto-publishes
        fully-qualified namespace paths into the UNS.
      </Explain>
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Built-in template hierarchy</div>
        <div className="space-y-1">
          {inheritance.map(t => (
            <div key={t.id} className="flex items-center gap-2 rounded px-3 py-1.5 bg-zinc-800/40 border border-zinc-700/40">
              {t.parent ? <span className="text-zinc-600 text-[10px] shrink-0">↳</span> : <span className="w-3 shrink-0" />}
              <code className="text-[11px] font-mono text-zinc-200 w-24 shrink-0">{t.id}</code>
              <span className="text-[11px] text-zinc-500">{t.props.join(" · ")}</span>
            </div>
          ))}
        </div>
      </div>
      <Code>{`POST /api/v1/assets/instances
{
  "id": "pump-a",
  "templateId": "pump",
  "nsPath": "Plant.Line1.PumpA",
  "driverId": "opc1",
  "tagMap": { "RunStatus": "ns=2;s=Pump1.Run", "FlowRate": "ns=2;s=Pump1.Flow" }
}
// → auto-publishes Plant.Line1.PumpA.RunStatus and .FlowRate into UNS`}</Code>
      <LiveBox label="GET /api/v1/assets/templates" data={templates.data} error={templates.error} loading={templates.loading} />
      <LiveBox label="GET /api/v1/assets/instances" data={instances.data} error={instances.error} loading={instances.loading} />
    </SectionCard>
  );
}

function FaceplateSection({ feature }: { feature: FeatureMeta }) {
  return (
    <SectionCard feature={feature}>
      <Explain>
        Faceplates are reusable popup view definitions tied to an asset template. When resolved for a
        specific instance the engine substitutes template variables with real paths. A <code className="text-zinc-300 text-[11px]">vfd-motor</code> instance
        automatically inherits the base <code className="text-zinc-300 text-[11px]">motor</code> faceplate views via DFS template traversal.
      </Explain>
      <FeatureGrid items={[
        { title: "overview",    desc: "Status summary, key values, start/stop button bindings." },
        { title: "diagnostics", desc: "Fault codes, run-hour counters, health indicators." },
        { title: "trend",       desc: "Historical chart pre-wired to asset-specific historian paths." },
        { title: "alarms",      desc: "Active and historical alarms scoped to this asset's NS path." },
      ]} />
      <Code>{`// Variable substitution in widget JSON:
"{{.NSPath}}"           →  Plant.Line1.PumpA
"{{.Name}}"             →  Pump A
"{{.Tags.RunStatus}}"   →  Plant.Line1.PumpA.RunStatus
"{{.Bindings.Fault}}"   →  opc1:ns=2;s=Pump1.Fault

// Get all views for an instance:
GET /api/v1/faceplates/pump-a
// Get a single view:
GET /api/v1/faceplates/pump-a/overview`}</Code>
    </SectionCard>
  );
}

function RecipeSection({ feature }: { feature: FeatureMeta }) {
  const history = useFetch(`${apiBase}/api/v1/recipes/history?limit=5`);
  const pending = useFetch(`${apiBase}/api/v1/recipes/pending?status=pending`);

  const flow = [
    { actor: "Any user",   action: "POST /recipes/{id}/request",         color: "#06b6d4", desc: "Submits approval request — logged immediately" },
    { actor: "Supervisor+",action: "GET  /recipes/pending",              color: "#f59e0b", desc: "Reviews open requests" },
    { actor: "Supervisor+",action: "POST /recipes/pending/{id}/approve", color: "#10b981", desc: "Approves → recipe executes immediately" },
    { actor: "Supervisor+",action: "POST /recipes/pending/{id}/reject",  color: "#ef4444", desc: "Rejects with optional reason note" },
    { actor: "Engineer+",  action: "POST /recipes/{id}/apply",           color: "#8b5cf6", desc: "Direct apply — skips approval workflow" },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        Recipes write multiple tag values in one atomic operation. Every application is logged to an
        immutable SQLite run log — who applied it, when, which tags changed, and any per-tag errors.
        The approval workflow gives operators a request path while Supervisors retain final authority.
      </Explain>
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Approval workflow</div>
        <div className="space-y-1.5">
          {flow.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded px-3 py-1.5 bg-zinc-800/40 border border-zinc-700/40">
              <span className="text-[10px] text-zinc-500 w-24 shrink-0">{s.actor}</span>
              <code className="text-[10px] font-mono shrink-0 w-60" style={{ color: s.color }}>{s.action}</code>
              <span className="text-[11px] text-zinc-400 truncate">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <LiveBox label="GET /api/v1/recipes/history?limit=5" data={history.data} error={history.error} loading={history.loading} />
      <LiveBox label="GET /api/v1/recipes/pending?status=pending" data={pending.data} error={pending.error} loading={pending.loading} />
    </SectionCard>
  );
}

function WiringSection({ feature }: { feature: FeatureMeta }) {
  const alive = useFetch<{ ok: boolean }>(`${apiBase}/api/v1/alive`);

  const stores = [
    { name: "TagStore",    always: true,  desc: "In-memory tag value cache. Always active." },
    { name: "Namespace",   always: true,  desc: "In-memory UNS tree. Always active." },
    { name: "Events",      always: true,  desc: "In-process typed pub/sub bus." },
    { name: "Assets",      always: true,  desc: "In-memory asset + template registry." },
    { name: "Faceplates",  always: true,  desc: "In-memory faceplate registry." },
    { name: "Historian",   always: false, desc: "--history-db  SQLite WAL time-series." },
    { name: "AlarmStore",  always: false, desc: "--alarm-db    SQLite alarm event log." },
    { name: "VersionStore",always: false, desc: "--version-db  Append-only project versions." },
    { name: "Security",    always: false, desc: "--security-db  Users + JWT secret." },
    { name: "Audit",       always: false, desc: "--audit-db    Immutable audit trail." },
    { name: "Recipes",     always: false, desc: "--recipe-db   Run log + approvals." },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        All stores are fields on the single <code className="text-zinc-300 text-[11px]">Runtime</code> struct passed to the HTTP server.
        Optional stores remain nil when their flag is absent — every handler checks for nil and returns
        503, so the binary runs fully in dev mode with zero flags.
      </Explain>
      <div className="mt-2 rounded-lg border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-zinc-800">
          <div>
            <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-emerald-500 font-medium">Always on</div>
            {stores.filter(s => s.always).map(s => (
              <div key={s.name} className="px-3 py-1.5 border-b border-zinc-800/50 last:border-0">
                <span className="font-mono text-[11px] text-zinc-200">{s.name}</span>
                <div className="text-[10px] text-zinc-600">{s.desc}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Optional (nil = dev mode)</div>
            {stores.filter(s => !s.always).map(s => (
              <div key={s.name} className="px-3 py-1.5 border-b border-zinc-800/50 last:border-0">
                <span className="font-mono text-[11px] text-zinc-300">{s.name}</span>
                <div className="text-[10px] text-zinc-600">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <LiveBox label="GET /api/v1/alive" data={alive.data} error={alive.error} loading={alive.loading} />
    </SectionCard>
  );
}

function ApiSection({ feature }: { feature: FeatureMeta }) {
  const groups = [
    { group: "Auth",       color: "#ef4444", routes: ["POST /auth/login", "GET /whoami"] },
    { group: "Project",    color: "#3b82f6", routes: ["GET /project", "POST /project"] },
    { group: "Tags",       color: "#06b6d4", routes: ["GET /tag/*", "POST /tag/*", "GET /history"] },
    { group: "Alarms",     color: "#f87171", routes: ["GET /alarms", "GET /alarms/history", "POST /alarms/{id}/ack"] },
    { group: "Recipes",    color: "#22d3ee", routes: ["POST /recipes/{id}/apply", "POST /recipes/{id}/request", "GET /recipes/history", "GET|POST /recipes/pending/{id}/approve|reject"] },
    { group: "Assets",     color: "#f97316", routes: ["GET|POST /assets/templates", "GET|POST|DELETE /assets/instances/{id}"] },
    { group: "Faceplates", color: "#a78bfa", routes: ["GET /faceplates/{instanceId}/{viewType}", "POST /faceplates"] },
    { group: "Namespace",  color: "#3b82f6", routes: ["GET /namespace/tree", "GET /namespace/search", "POST|DELETE /namespace/*"] },
    { group: "Users",      color: "#ef4444", routes: ["GET|POST /users", "PUT /users/{u}/role|enabled", "DELETE /users/{u}"] },
    { group: "Audit",      color: "#84cc16", routes: ["GET /audit"] },
    { group: "Versions",   color: "#8b5cf6", routes: ["GET /versions", "POST /versions/{id}/restore"] },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        All <code className="text-zinc-300 text-[11px]">/api/v1</code> routes are protected by JWT middleware injected at the
        router level. The login endpoint is public. Permission checks are per-endpoint using chi middleware
        chains. In dev mode the runtime injects anonymous/admin identity automatically.
      </Explain>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {groups.map(g => (
          <div key={g.group} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2">
            <div className="text-[10px] font-semibold mb-1.5" style={{ color: g.color }}>{g.group}</div>
            {g.routes.map(r => (
              <div key={r} className="text-[10px] font-mono text-zinc-500 leading-relaxed truncate">{r}</div>
            ))}
          </div>
        ))}
      </div>
      <Code>{`# Authenticate
curl -X POST localhost:3001/api/v1/auth/login \\
  -d '{"username":"admin","password":"secret"}' | jq .token

# Use JWT on any route
curl -H "Authorization: Bearer <token>" \\
  localhost:3001/api/v1/audit?limit=10`}</Code>
    </SectionCard>
  );
}

// ── IDE section components ─────────────────────────────────────────────────

function CanvasSection({ feature }: { feature: FeatureMeta }) {
  const widgets = [
    { type: "Label",    desc: "Static or tag-bound text with format string" },
    { type: "Gauge",    desc: "Semicircular analog gauge with min/max/threshold" },
    { type: "Bar",      desc: "Vertical or horizontal level indicator" },
    { type: "Button",   desc: "Momentary or toggle, writes value on click" },
    { type: "Chart",    desc: "Rolling time-series from historian" },
    { type: "LED",      desc: "Boolean state indicator with color mapping" },
    { type: "Setpoint", desc: "Numeric input that writes to a tag on confirm" },
    { type: "Shape",    desc: "Rectangle or ellipse, color-bindable" },
  ];

  const shortcuts = [
    { keys: "Del",        desc: "Delete selected widget" },
    { keys: "Ctrl+Z/Y",   desc: "Undo / Redo" },
    { keys: "Ctrl+C/V",   desc: "Copy / Paste (across pages)" },
    { keys: "Ctrl+D",     desc: "Duplicate widget" },
    { keys: "Ctrl+Scroll",desc: "Zoom canvas 25%–250%" },
    { keys: "Right-click",desc: "Lock · copy · delete context menu" },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        The canvas is a grid-based drag-and-drop editor. Widgets snap to grid cells and can be resized
        by dragging corner handles. Every change goes through Zustand with full undo/redo history.
        Pages, background color, and grid size are configurable per page.
      </Explain>
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Widget library</div>
        <div className="grid grid-cols-4 gap-1.5">
          {widgets.map(w => (
            <div key={w.type} className="rounded border border-zinc-700/50 px-2 py-1.5 bg-zinc-800/40">
              <div className="text-[11px] font-mono font-semibold text-zinc-200">{w.type}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{w.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Keyboard shortcuts</div>
        <div className="grid grid-cols-2 gap-1">
          {shortcuts.map(s => (
            <div key={s.keys} className="flex items-center gap-2 rounded px-2 py-1 bg-zinc-800/30">
              <code className="text-[10px] font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 shrink-0 min-w-[72px] text-center">{s.keys}</code>
              <span className="text-[10px] text-zinc-500">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function TagBrowserSection({ feature }: { feature: FeatureMeta }) {
  return (
    <SectionCard feature={feature}>
      <Explain>
        The Tag Browser panel has two tabs that together cover every way you'd want to find a tag —
        by its protocol-native address, or by its logical position in the Unified Namespace.
      </Explain>
      <FeatureGrid items={[
        { title: "By Source", desc: "Browse each datasource's raw protocol addresses. Shows connected/error status. Click or drag any tag to bind it to the selected canvas widget." },
        { title: "Namespace", desc: "UNS tree with lazy-loaded children on expand. Node icons distinguish folder ▸ asset ◈ tag ◎ virtual ⊕." },
        { title: "Live values", desc: "Both tabs show real-time values from the WebSocket subscription — no extra polling." },
        { title: "Search", desc: "Debounced full-text search across the entire UNS — results from all protocols simultaneously." },
      ]} />
      <div className="mt-3 rounded-lg border border-zinc-700/50 px-4 py-3 bg-zinc-800/30 text-[11px] text-zinc-300 leading-relaxed">
        <span className="font-semibold text-zinc-200">Drag to bind:</span>{" "}
        Drag any tag from either tab and drop it onto a widget on the canvas to instantly set its data binding.
        Works across both tabs and all widget types.
      </div>
    </SectionCard>
  );
}

function PropertiesSection({ feature }: { feature: FeatureMeta }) {
  const propGroups = [
    {
      group: "Binding", color: "#3b82f6",
      props: ["Tag path (UNS or driver address)", "Binding mode (read / read-write)", "Write value (for buttons)"],
    },
    {
      group: "Display", color: "#10b981",
      props: ["Label text", "Format string (%.1f, %d, …)", "Unit suffix", "Decimal places"],
    },
    {
      group: "Thresholds", color: "#f59e0b",
      props: ["Low-low / Low / High / High-high limits", "Color per threshold band", "Alarm text override"],
    },
    {
      group: "Layout", color: "#a78bfa",
      props: ["Grid x/y position", "Width / Height in cells", "Z-index (layering)", "Locked (prevents accidental move)"],
    },
  ];

  return (
    <SectionCard feature={feature}>
      <Explain>
        Clicking any canvas widget selects it and opens its properties in the right panel. All changes
        are immediately reflected on the canvas and added to the undo stack.
      </Explain>
      <div className="mt-2 space-y-2">
        {propGroups.map(g => (
          <div key={g.group} className="rounded-lg border border-zinc-700/50 overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: g.color + "15", color: g.color }}>{g.group}</div>
            <div className="px-3 py-2 bg-zinc-800/30">
              {g.props.map(p => (
                <div key={p} className="text-[11px] text-zinc-400 leading-relaxed">· {p}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function AlarmsIDESection({ feature }: { feature: FeatureMeta }) {
  const alarms = useFetch(`${apiBase}/api/v1/alarms`);
  return (
    <SectionCard feature={feature}>
      <Explain>
        The Alarms panel streams active alarms over the same WebSocket connection used for tag values.
        Alarms arrive in real time as they raise and clear — no polling required.
      </Explain>
      <FeatureGrid items={[
        { title: "Live stream", desc: "Active alarms pushed over WebSocket — zero polling overhead." },
        { title: "One-click ack", desc: "Acknowledge any alarm directly from the IDE. Recorded in the audit log." },
        { title: "History tab", desc: "Query cleared and acknowledged alarms with time-range filtering." },
        { title: "Severity levels", desc: "Low · Medium · High · Critical — color-coded per severity in the list." },
      ]} />
      <LiveBox label="GET /api/v1/alarms (active alarms)" data={alarms.data} error={alarms.error} loading={alarms.loading} />
    </SectionCard>
  );
}

function RecipesIDESection({ feature }: { feature: FeatureMeta }) {
  const recipes = useFetch(`${apiBase}/api/v1/recipes`);
  return (
    <SectionCard feature={feature}>
      <Explain>
        The Recipes panel in the IDE surfaces all recipes defined in the loaded project. Engineers can
        apply recipes directly or submit approval requests. The run history and pending approvals are
        visible inline without opening a separate tool.
      </Explain>
      <FeatureGrid items={[
        { title: "Apply directly", desc: "Engineer+ role can apply a recipe immediately — tags are written in batch." },
        { title: "Request approval", desc: "Operators submit a request. The pending list appears for Supervisors." },
        { title: "Run history", desc: "Last N runs shown per recipe — who applied, when, how many tags changed." },
        { title: "Pending list", desc: "All open approval requests with approve/reject actions per row." },
      ]} />
      <LiveBox label="GET /api/v1/recipes" data={recipes.data} error={recipes.error} loading={recipes.loading} />
    </SectionCard>
  );
}

function DeploySection({ feature }: { feature: FeatureMeta }) {
  return (
    <SectionCard feature={feature}>
      <Explain>
        The deploy workflow supports any number of named runtime targets — local dev, lab panel,
        plant floor controller. Switching targets reconnects the WebSocket and re-fetches live data
        automatically. Projects travel as self-contained JSON with no external dependencies.
      </Explain>
      <FeatureGrid items={[
        { title: "Multi-target", desc: "Add any number of runtime URLs. One dropdown to switch. Active target highlighted." },
        { title: "Push (Deploy)", desc: "POST the project JSON to the active runtime. Response shows page and datasource counts." },
        { title: "Pull", desc: "Fetch what's currently running on the runtime and load it into the IDE for editing." },
        { title: "Save / Load", desc: "Save project to .xhmi.json on disk. Load any file back into the IDE instantly." },
        { title: "Themes", desc: "Choose from built-in dark and light themes. Custom theme variables applied at runtime." },
        { title: "Undo / Redo", desc: "Full history stack. Ctrl+Z / Ctrl+Y. History survives page navigation within a session." },
      ]} />
      <div className="mt-3 rounded-lg border border-zinc-700/50 px-4 py-3 bg-zinc-800/30 text-[11px] text-zinc-300">
        <span className="font-semibold text-zinc-200">Project format:</span>{" "}
        A single <code className="font-mono text-zinc-400">.xhmi.json</code> contains pages, widgets, datasources, and recipes.
        It's human-readable, diff-friendly, and can be committed to version control.
      </div>
    </SectionCard>
  );
}

// ── Main Demo modal ────────────────────────────────────────────────────────

const SECTION_MAP: Record<string, (f: FeatureMeta) => React.ReactNode> = {
  namespace:   (f) => <NamespaceSection key={f.id} feature={f} />,
  expr:        (f) => <ExprSection key={f.id} feature={f} />,
  eventbus:    (f) => <EventBusSection key={f.id} feature={f} />,
  security:    (f) => <SecuritySection key={f.id} feature={f} />,
  historian:   (f) => <HistorianSection key={f.id} feature={f} />,
  assets:      (f) => <AssetsSection key={f.id} feature={f} />,
  faceplate:   (f) => <FaceplateSection key={f.id} feature={f} />,
  recipe:      (f) => <RecipeSection key={f.id} feature={f} />,
  wiring:      (f) => <WiringSection key={f.id} feature={f} />,
  api:         (f) => <ApiSection key={f.id} feature={f} />,
  canvas:      (f) => <CanvasSection key={f.id} feature={f} />,
  tagbrowser:  (f) => <TagBrowserSection key={f.id} feature={f} />,
  properties:  (f) => <PropertiesSection key={f.id} feature={f} />,
  "alarms-ide":(f) => <AlarmsIDESection key={f.id} feature={f} />,
  "recipes-ide":(f) => <RecipesIDESection key={f.id} feature={f} />,
  deploy:      (f) => <DeploySection key={f.id} feature={f} />,
};

function SidebarGroup({
  label, color, features, activeId, onSelect,
}: {
  label: string; color: string;
  features: FeatureMeta[]; activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-1">
      <div className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-widest font-semibold" style={{ color }}>
        {label}
      </div>
      {features.map((f, i) => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={`w-full text-left flex items-center gap-2.5 px-4 py-1.5 text-[11px] transition-colors ${
            activeId === f.id
              ? "text-zinc-100 bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
          }`}
        >
          <span className="text-zinc-700 shrink-0 w-4 text-center text-[10px]">{i + 1}</span>
          <span className="text-base leading-none shrink-0" style={{ color: activeId === f.id ? f.accentColor : undefined }}>
            {f.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{f.title}</div>
          </div>
          {activeId === f.id && <div className="w-1 h-3.5 rounded-full shrink-0" style={{ background: f.accentColor }} />}
        </button>
      ))}
    </div>
  );
}

export function DemoModal({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState("namespace");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) => {
    setActiveId(id);
    document.getElementById(`demo-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      for (const f of ALL_FEATURES) {
        const section = document.getElementById(`demo-${f.id}`);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= 200) setActiveId(f.id);
      }
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex" onClick={onClose}>
      <div
        className="flex flex-1 m-4 rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950/70 flex flex-col">
          {/* Brand */}
          <div className="px-4 py-4 border-b border-zinc-800">
            <div className="font-black text-sm text-zinc-100 tracking-tight">Speth's Screens</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Platform Feature Showcase</div>
            <div className="flex gap-1.5 mt-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/50 text-blue-400">
                {RUNTIME_FEATURES.length} runtime
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/60 border border-violet-800/50 text-violet-400">
                {IDE_FEATURES.length} ide
              </span>
            </div>
          </div>

          {/* Nav */}
          <div className="flex-1 overflow-auto py-1">
            <SidebarGroup
              label="Runtime — Go"
              color="#3b82f6"
              features={RUNTIME_FEATURES}
              activeId={activeId}
              onSelect={scrollTo}
            />
            <div className="mx-4 my-2 border-t border-zinc-800" />
            <SidebarGroup
              label="IDE — React"
              color="#a78bfa"
              features={IDE_FEATURES}
              activeId={activeId}
              onSelect={scrollTo}
            />
          </div>

          <div className="px-4 py-3 border-t border-zinc-800">
            <div className="text-[9px] text-zinc-600 leading-relaxed">
              Live API calls hit the active runtime target. Start with{" "}
              <code className="text-zinc-500">go run ./cmd/speths-screens</code>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
            <div>
              <h1 className="font-black text-base text-zinc-100 tracking-tight">Speth's Screens</h1>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {RUNTIME_FEATURES.length + IDE_FEATURES.length} features built across runtime and IDE —
                scroll through to explore, or click a feature in the sidebar.
              </p>
            </div>
            <button onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-2 py-1 rounded hover:bg-zinc-800 transition-colors">
              ×
            </button>
          </div>

          {/* Hero stats bar */}
          <div className="flex items-center gap-6 px-6 py-3 border-b border-zinc-800 bg-zinc-950/40 shrink-0">
            {[
              { value: "Go 1.25",   label: "runtime" },
              { value: "React 19",  label: "IDE + panel" },
              { value: "SQLite",    label: "storage (no CGO)" },
              { value: "JWT HS256", label: "auth" },
              { value: "WebSocket", label: "live values" },
              { value: "chi",       label: "router" },
              { value: "Zustand",   label: "IDE state" },
              { value: "Tailwind v4", label: "styles" },
            ].map(s => (
              <div key={s.label} className="text-center shrink-0">
                <div className="text-[11px] font-bold text-zinc-200">{s.value}</div>
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Scrollable sections */}
          <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-6">
            {ALL_FEATURES.map(f => SECTION_MAP[f.id]?.(f))}
          </div>
        </div>
      </div>
    </div>
  );
}
