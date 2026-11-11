// The end-to-end test project: a memory datasource ("Script state") with a variable for every widget type, each named
// in the namespace (Test.<name>) and bound the way that widget type uses a variable.
//
//   value display    numericDisplay textDisplay led gauge tank multiState table trend historyLog   -> value tag
//   value input      numericInput textInput setpoint                                              -> value tag, written by the operator
//   button           increment, toggle and write actions                                          -> action tags
//   recipes          a recipe that writes two variables                                           -> recipe entries
//   customWidget     a parameter that names a variable                                            -> {param}
//   alarmBanner      an alarm rule on a variable                                                  -> alarm expression
//   symbol, pipe     animate / flow driven by a variable                                          -> driven property
//   image, pageList, clock, driverStatus, userMenu (no value of their own)                        -> visible binding
//
// Every variable is read by the test through the runtime's API, so "the value changed" is checked on the runtime and on
// the screen separately.

export const VARS = [
  // [name, type]
  ["numericDisplay", "real"], ["textDisplay", "string"], ["led", "bool"], ["gauge", "real"], ["tank", "real"],
  ["multiState", "int"], ["tableA", "real"], ["tableB", "real"], ["trend", "real"], ["historyLog", "real"],
  ["btnCount", "int"], ["btnFlag", "bool"], ["btnWrite", "int"],
  ["numericInput", "real"], ["textInput", "string"], ["setpoint", "real"],
  ["recA", "int"], ["recB", "string"],
  ["customVal", "real"], ["alarmLevel", "real"], ["symAnim", "bool"], ["pipeFlow", "bool"],
  ["visImage", "bool"], ["visPageList", "bool"], ["visClock", "bool"], ["visDriverStatus", "bool"], ["visUserMenu", "bool"],
  ["visSymbol", "bool"], ["visPipe", "bool"], ["visAlarmBanner", "bool"], ["visCustom", "bool"], ["visRecipes", "bool"],
];

const ns = (name) => `ns:Test.${name}`;
let n = 0;
const id = (type) => `${type}-${++n}`;

/** A widget on a 3 by 2 cell footprint at column/row (c, r) of a page. */
const at = (c, r, w = 3, h = 2) => ({ x: c * 3, y: r * 2, w, h });
const W = (type, label, c, r, extra = {}, size) => ({ id: `w-${label}`, type, ...at(c, r, ...(size ?? [])), props: { label: `W ${label}`, ...(extra.props ?? {}) }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "props")) });

const ICON_SRC = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='steelblue'/></svg>");

export function buildProject() {
  n = 0;
  const values = [
    W("numericDisplay", "numericDisplay", 0, 0, { bindings: { value: ns("numericDisplay") }, props: { unit: "u" } }),
    W("textDisplay", "textDisplay", 1, 0, { bindings: { value: ns("textDisplay") } }),
    W("led", "led", 2, 0, { bindings: { value: ns("led") }, props: { trueLabel: "LED_ON", falseLabel: "LED_OFF" } }),
    W("gauge", "gauge", 3, 0, { bindings: { value: ns("gauge") }, props: { min: 0, max: 100, unit: "bar" } }),
    W("tank", "tank", 0, 1, { bindings: { value: ns("tank") }, props: { min: 0, max: 100, unit: "%" } }),
    W("multiState", "multiState", 1, 1, { bindings: { value: ns("multiState") }, props: { states: [
      { value: 0, label: "STATE_IDLE", color: "#64748b" }, { value: 1, label: "STATE_RUN", color: "#16a34a" }, { value: 2, label: "STATE_FAULT", color: "#dc2626" },
    ] } }),
    W("table", "table", 2, 1, { props: { rows: [
      { binding: ns("tableA"), label: "RowA" }, { binding: ns("tableB"), label: "RowB" },
    ] } }),
    W("trend", "trend", 0, 2, { props: { duration: 60, tags: [{ binding: ns("trend"), color: "#2563eb", label: "TrendPen" }], showToolbar: false } }, [6, 3]),
    W("historyLog", "historyLog", 2, 2, { bindings: { value: ns("historyLog") } }, [4, 3]),
  ];

  const inputs = [
    // The scenario that was reported: a button that increments a memory variable, and a numeric display of it.
    W("button", "btnIncrement", 0, 0, { bindings: { value: ns("btnCount") }, events: { onClick: [{ type: "increment", step: 1 }] } }),
    W("numericDisplay", "btnCountDisplay", 1, 0, { bindings: { value: ns("btnCount") } }),
    W("button", "btnToggle", 2, 0, { bindings: { value: ns("btnFlag") }, events: { onClick: [{ type: "toggle" }] } }),
    W("led", "btnFlagLed", 3, 0, { bindings: { value: ns("btnFlag") }, props: { trueLabel: "FLAG_ON", falseLabel: "FLAG_OFF" } }),
    W("button", "btnWrite7", 0, 1, { bindings: { value: ns("btnWrite") }, events: { onClick: [{ type: "write", value: 7 }] } }),
    W("numericDisplay", "btnWriteDisplay", 1, 1, { bindings: { value: ns("btnWrite") } }),
    W("numericInput", "numericInput", 2, 1, { bindings: { value: ns("numericInput") }, props: { min: 0, max: 1000 } }),
    W("textInput", "textInput", 3, 1, { bindings: { value: ns("textInput") } }),
    W("setpoint", "setpoint", 0, 2, { bindings: { value: ns("setpoint") }, props: { min: 0, max: 100, step: 1, unit: "u" } }),
    W("recipes", "recipes", 1, 2, { props: { recipeSetId: "preset" } }, [3, 3]),
    W("numericDisplay", "recADisplay", 0, 3, { bindings: { value: ns("recA") } }),
    W("textDisplay", "recBDisplay", 2, 3, { bindings: { value: ns("recB") } }),
  ];

  const displayOnly = [
    W("image", "image", 0, 0, { bindings: { visible: ns("visImage") }, props: { src: ICON_SRC } }),
    W("symbol", "symbol", 1, 0, { bindings: { visible: ns("visSymbol") }, props: { symbolId: "centrifugal-pump", motion: "spin" },
      dynamics: { animate: { expr: "{ns:Test.symAnim}" } } }),
    W("pipe", "pipe", 2, 0, { bindings: { visible: ns("visPipe") }, props: { points: "0,50 100,50", weight: 6, color: "#2563eb", flowColor: "#ffffff", cycleSeconds: 2 },
      dynamics: { flow: { expr: "{ns:Test.pipeFlow}" } } }),
    W("alarmBanner", "alarmBanner", 3, 0, { bindings: { visible: ns("visAlarmBanner") } }),
    W("pageList", "pageList", 0, 1, { bindings: { visible: ns("visPageList") }, props: { style: "list" } }),
    W("clock", "clock", 1, 1, { bindings: { visible: ns("visClock") } }),
    W("driverStatus", "driverStatus", 2, 1, { bindings: { visible: ns("visDriverStatus") } }),
    W("userMenu", "userMenu", 3, 1, { bindings: { visible: ns("visUserMenu") } }),
    W("customWidget", "customWidget", 0, 2, { bindings: { visible: ns("visCustom") }, props: { customWidgetId: "tile", params: { v: ns("customVal") } } }),
    W("recipes", "recipesVisible", 1, 2, { bindings: { visible: ns("visRecipes") }, props: { recipeSetId: "preset" } }),
    W("recipes", "recipeSet", 0, 4, { props: { recipeSetId: "mix" } }, [4, 6]),
  ];

  return {
    schemaVersion: 6, version: "1", name: "Memory E2E",
    datasources: [{ id: "mem", label: "Script state", type: "memory", config: {
      memoryTags: VARS.map(([path, type]) => ({ path, type })),
    } }],
    namespace: [
      { path: "Test", type: "folder" },
      ...VARS.map(([path, type]) => ({ path: `Test.${path}`, type: "tag", driverId: "mem", driverAddr: path, dataType: type === "real" ? "float" : type })),
    ],
    alarmRules: [{ id: "level-high", name: "Level high", expr: "{ns:Test.alarmLevel} > 50", severity: "warning", message: "ALARM_RAISED" }],
    recipeSets: [{ id: "mix", name: "Mixer", variables: [{ binding: ns("recA") }, { binding: ns("recB") }],
      recipes: [{ id: "one", name: "One", values: { [ns("recA")]: 1, [ns("recB")]: "one" } }, { id: "two", name: "Two", values: { [ns("recA")]: 2, [ns("recB")]: "two" } }] }],
    recipes: [{ id: "preset", name: "Preset", entries: [{ binding: ns("recA"), value: 11 }, { binding: ns("recB"), value: "RECIPE_X" }] }],
    customWidgets: [{ id: "tile", name: "Tile", params: [{ name: "v" }], widgets: [
      { localId: "inner", type: "numericDisplay", x: 0, y: 0, w: 4, h: 2, bindings: { value: "{v}" }, props: { label: "Inner" } },
    ] }],
    pages: [
      { id: "values", name: "Values", widgets: values },
      { id: "inputs", name: "Inputs", widgets: inputs },
      { id: "display", name: "Display only", widgets: displayOnly },
    ],
  };
}
