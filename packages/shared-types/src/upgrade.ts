// Upgrades project JSON in any older format to the current one. The Go
// upgrader (internal/project/upgrade.go) does the same; both are held to the
// golden files in testdata/upgrade.
import schema from "../../../schema.json";

/** The project format this build writes. A file without schemaVersion is 1. */
export const CURRENT_SCHEMA_VERSION = 2;

type Obj = Record<string, unknown>;

export type UpgradeResult = {
  /** The project in the current format (the input itself when already current). */
  project: Obj;
  /** What the upgrade dropped, for the user to read. */
  notes: string[];
};

export class UpgradeError extends Error {}

/** Upgrades a parsed project. Throws UpgradeError for a file newer than this build. */
export function upgradeProject(input: unknown): UpgradeResult {
  if (!isObj(input)) throw new UpgradeError("the project is not a JSON object");
  const raw = input.schemaVersion;
  let version = 1;
  if (raw !== undefined) {
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
      throw new UpgradeError(`schemaVersion ${JSON.stringify(raw)} is not a format version`);
    }
    version = raw;
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UpgradeError(`the project is format ${version}; this version of Speth's Screens reads up to ${CURRENT_SCHEMA_VERSION}`);
  }
  if (version === CURRENT_SCHEMA_VERSION) return { project: input, notes: [] };

  const doc = structuredClone(input);
  const notes: string[] = [];
  v1ToV2(doc, notes);
  doc.schemaVersion = CURRENT_SCHEMA_VERSION;
  return { project: doc, notes };
}

function v1ToV2(doc: Obj, notes: string[]) {
  if ("users" in doc) {
    // Users moved to the runtime's security.db (Phase 1, defect 9).
    delete doc.users;
    notes.push("dropped the project's users list: users live on the runtime");
  }
  for (const pg of objects(doc.pages)) {
    for (const w of objects(pg.widgets)) widget(w, `page ${quote(pg.name)}, widget ${String(w.id)}`, notes);
  }
  for (const fp of objects(doc.faceplates)) {
    for (const w of objects(fp.widgets)) widget(w, `faceplate ${quote(fp.name)}, widget ${String(w.localId)}`, notes);
  }
}

const MOVED_CONFIG_KEYS = new Set(["colorBinding", "objectFit"]);
const BUTTON_ACTION_KEYS = new Set(["action", "momentary", "onValue", "offValue", "navigateTo"]);
const UNUSED_CONFIG_KEYS = new Set(["format", "decimals", "placeholder"]);
const DYNAMIC_ACTIONS: Record<string, string> = { onClick: "onClick", onPressed: "onPress", onReleased: "onRelease" };
const ACTION_FIELDS = ["actionType", "writeTo", "writeValue", "step", "pageId", "url"];

function widget(w: Obj, where: string, notes: string[]) {
  const type = str(w.type);
  where = `${where} (${type})`;
  const cfg: Obj = isObj(w.config) ? { ...w.config } : {};
  const props: Obj = {};
  const bindings: Obj = {};
  const events: Record<string, Obj[]> = {};
  const addEvent = (name: string, a: Obj) => (events[name] ??= []).push(a);

  // Tags.
  const b = str(w.binding);
  if (b) {
    if (type === "textDisplay" && !b.includes(":")) {
      // v1 showed a binding without ":" as literal text.
      if (!str(cfg.staticText)) props.staticText = b;
    } else {
      bindings.value = b;
    }
  }
  if (str(w.visibleBinding)) bindings.visible = w.visibleBinding;
  if (str(cfg.colorBinding)) bindings.color = cfg.colorBinding;
  if (str(cfg.objectFit) && !str(cfg.fit)) cfg.fit = cfg.objectFit;

  // A button's own action becomes events.
  if (type === "button") {
    for (const [name, actions] of Object.entries(buttonEvents(cfg))) for (const a of actions) addEvent(name, a);
  }

  // Settings: only the ones this widget type has. "" meant "default".
  const allowed = propsKeys().get(type) ?? new Set<string>();
  for (const k of Object.keys(cfg).sort()) {
    const v = cfg[k];
    if (MOVED_CONFIG_KEYS.has(k) || (type === "button" && BUTTON_ACTION_KEYS.has(k))) continue;
    if (v === "" || v === null || v === undefined) continue;
    if (UNUSED_CONFIG_KEYS.has(k)) notes.push(`${where}: dropped setting ${k}, which no widget reads`);
    else if (!allowed.has(k)) notes.push(`${where}: dropped setting ${k}, which this widget type does not have`);
    else props[k] = v;
  }

  // Dynamics: actions become events, the rest stays.
  const dynamics: Obj[] = [];
  for (const d of objects(w.dynamics)) {
    const event = DYNAMIC_ACTIONS[str(d.kind)];
    if (event) {
      const a = dynamicAction(d, where, notes);
      if (a) addEvent(event, a);
      continue;
    }
    const kept = { ...d };
    for (const f of ACTION_FIELDS) delete kept[f];
    dynamics.push(kept);
  }

  for (const k of ["binding", "visibleBinding", "config", "dynamics", "props", "bindings", "events"]) delete w[k];
  if (Object.keys(props).length) w.props = props;
  if (Object.keys(bindings).length) w.bindings = bindings;
  if (Object.keys(events).length) w.events = events;
  if (dynamics.length) w.dynamics = dynamics;
}

/** A v1 button's action settings as events: navigate on click, momentary
 *  writes on press and release, or a toggle on click. */
function buttonEvents(cfg: Obj): Record<string, Obj[]> {
  if (cfg.action === "navigate") {
    const page = str(cfg.navigateTo);
    return page ? { onClick: [{ type: "navigate", page }] } : {};
  }
  const on = orDefault(cfg.onValue, 1), off = orDefault(cfg.offValue, 0);
  if (cfg.momentary === false) return { onClick: [{ type: "toggle", on, off }] };
  return { onPress: [{ type: "write", value: on }], onRelease: [{ type: "write", value: off }] };
}

/** A v1 action dynamic as a v2 action, or undefined (with a note) when v1
 *  would have done nothing. */
function dynamicAction(d: Obj, where: string, notes: string[]): Obj | undefined {
  const tag = str(d.writeTo);
  const at = str(d.actionType);
  switch (at) {
    case "writeValue":
    case "toggleValue":
    case "incrementValue":
      if (!tag) {
        notes.push(`${where}: dropped a ${at} action without a tag to write`);
        return undefined;
      }
      if (at === "writeValue") return { type: "write", tag, value: d.writeValue };
      if (at === "toggleValue") return { type: "toggle", tag };
      return d.step !== undefined ? { type: "increment", tag, step: d.step } : { type: "increment", tag };
    case "navigate":
      if (str(d.pageId)) return { type: "navigate", page: d.pageId };
      break;
    case "openUrl":
      if (str(d.url)) return { type: "openUrl", url: d.url };
      break;
  }
  notes.push(`${where}: dropped an incomplete ${str(d.kind)} action`);
  return undefined;
}

type SchemaNode = { $ref?: string; const?: string; properties?: Record<string, SchemaNode>; allOf?: SchemaNode[]; oneOf?: SchemaNode[] };
let keysCache: Map<string, Set<string>> | undefined;

/** Which settings each widget type has, read from schema.json: its settings
 *  type's own keys plus those it includes (allOf). */
export function propsKeys(): Map<string, Set<string>> {
  if (keysCache) return keysCache;
  const defs = (schema as unknown as { $defs: Record<string, SchemaNode> }).$defs;
  const collect = (name: string, into: Set<string>) => {
    const def = defs[name];
    if (!def) return;
    for (const k of Object.keys(def.properties ?? {})) into.add(k);
    for (const a of def.allOf ?? []) collect((a.$ref ?? "").replace("#/$defs/", ""), into);
  };
  const out = new Map<string, Set<string>>();
  for (const branch of defs.TypedProps?.oneOf ?? []) {
    const type = branch.properties?.type?.const;
    const ref = branch.properties?.props?.$ref?.replace("#/$defs/", "");
    if (!type || !ref) throw new Error("schema.json: TypedProps branch without type or props");
    const keys = new Set<string>();
    collect(ref, keys);
    out.set(type, keys);
  }
  keysCache = out;
  return out;
}

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function objects(v: unknown): Obj[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function orDefault(v: unknown, def: unknown): unknown {
  return v === undefined || v === null || v === "" ? def : v;
}
/** Quotes like Go's %q for plain names. */
function quote(v: unknown): string {
  return JSON.stringify(str(v));
}
