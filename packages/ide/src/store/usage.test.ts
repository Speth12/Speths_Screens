import { describe, expect, it } from "vitest";
import type { Page, Project, Widget } from "@speths-screens/shared-types";
import { customWidgetUsage, datasourceOfTag, datasourceUsage, pageSummary, tagsInText, tagsOfWidget } from "./usage";

const w = (id: string, type: string, extra: Partial<Widget> = {}): Widget => ({ id, type, x: 0, y: 0, w: 2, h: 2, ...extra }) as Widget;
const project = (pages: Page[], extra: Partial<Project> = {}): Project => ({
  schemaVersion: 7, version: "0.1.0", pages,
  datasources: [{ id: "plc", label: "PLC", type: "rest", config: {} }, { id: "opc", label: "OPC", type: "opcua", config: {} }, { id: "calc", label: "Calc", type: "virtual", config: { tags: [{ path: "x", expr: "{plc:Temp} * 2" }] } }] as Project["datasources"],
  namespace: [{ path: "plant.temp", type: "tag", driverId: "opc", driverAddr: "Temp" }],
  ...extra,
});

describe("tag references", () => {
  it("the datasource of a tag, through the namespace for ns: paths", () => {
    const p = project([]);
    expect(datasourceOfTag(p, "plc:Arp.X")).toBe("plc");
    expect(datasourceOfTag(p, "ns:plant.temp")).toBe("opc");
    expect(datasourceOfTag(p, "ns:plant.nothing")).toBeUndefined();
    expect(datasourceOfTag(p, "nocolon")).toBeUndefined();
  });
  it("finds references in an expression and in script source", () => {
    expect(tagsInText("{plc:Temp} > 5 && {ns:plant.temp} < 1")).toEqual(["plc:Temp", "ns:plant.temp"]);
    expect(tagsInText("const t = readTag('plc:Arp.Plc.Eclr/rTemp'); await writeTag(\"opc:Setpoint\", 5);")).toEqual(["plc:Arp.Plc.Eclr/rTemp", "opc:Setpoint"]);
  });
  it("a widget's tags: bindings, trend pens, table rows, and references in dynamics and events", () => {
    const widget = w("a", "trend", {
      bindings: { value: "plc:A" },
      props: { tags: [{ binding: "opc:B", color: "#fff" }], rows: [{ label: "r", binding: "plc:C" }] } as never,
      dynamics: { visible: { expr: "{ns:plant.temp} > 3" } } as never,
      events: { onClick: [{ type: "write", binding: "x", value: "{plc:D}" }] } as never,
    });
    expect(tagsOfWidget(widget).sort()).toEqual(["ns:plant.temp", "opc:B", "plc:A", "plc:C", "plc:D"]);
  });
});

describe("page summary", () => {
  it("counts widgets by type, the tags used, layouts and what drives or acts", () => {
    const page: Page = {
      id: "p", name: "Main", script: "log(1)",
      widgets: [
        w("1", "gauge", { bindings: { value: "plc:A" } }),
        w("2", "gauge", { bindings: { value: "plc:A" }, layout: { tablet: { x: 1 } } } as never),
        w("3", "button", { layout: { phone: { hidden: true } }, dynamics: { visible: { expr: "{plc:B}" } } as never, events: { onClick: [{ type: "toggle" }] } as never }),
      ],
    };
    const s = pageSummary(page);
    expect(s.widgets).toBe(3);
    expect(s.byType).toEqual([["gauge", 2], ["button", 1]]);
    expect(s.tags).toEqual(["plc:A", "plc:B"]);
    expect([s.tablet, s.phone, s.driven, s.acting, s.hasScript]).toEqual([1, 1, 1, 1, true]);
  });
});

describe("datasource usage", () => {
  it("pages, alarms, scripts, names and computed tags that use it", () => {
    const p = project(
      [{ id: "p1", name: "Overview", widgets: [w("1", "gauge", { bindings: { value: "plc:A" } }), w("2", "gauge", { bindings: { value: "ns:plant.temp" } })] },
        { id: "p2", name: "Empty", widgets: [] }],
      {
        alarmRules: [{ id: "a", name: "Hot", expr: "{plc:A} > 1", severity: "warning", message: "m" }, { id: "b", name: "Other", expr: "{opc:Z} > 1", severity: "info", message: "m" }] as never,
        scripts: [{ id: "s", name: "Counter", trigger: { onChange: ["plc:A"] }, source: "await writeTag('opc:Q', 1)", writes: ["opc:Q"] }] as never,
      },
    );
    const plc = datasourceUsage(p, "plc");
    expect(plc.pages).toEqual([{ id: "p1", name: "Overview", widgets: 1 }]);
    expect(plc.alarms).toEqual(["Hot"]);
    expect(plc.scripts).toEqual(["Counter"]);
    expect(plc.calculated).toBe(1);
    const opc = datasourceUsage(p, "opc");
    expect(opc.pages).toEqual([{ id: "p1", name: "Overview", widgets: 1 }]); // through its namespace name
    expect(opc.alarms).toEqual(["Other"]);
    expect(opc.named).toBe(1);
  });
});

describe("custom widget usage", () => {
  const use = (id: string) => ({ id: `w${Math.random()}`, type: "customWidget", x: 0, y: 0, w: 2, h: 2, props: { customWidgetId: id } }) as unknown as Widget;
  const base = (over: Partial<Project>): Project => ({ schemaVersion: 7, version: "1", datasources: [], pages: [], ...over }) as Project;

  it("is nothing for a custom widget nothing uses", () => {
    expect(customWidgetUsage(base({ pages: [{ id: "p", name: "Main", widgets: [use("other")] }] }), "cw")).toEqual({ pages: [], customWidgets: [], frame: 0, total: 0 });
  });

  it("counts each place: pages, other custom widgets and screen edges", () => {
    const project = base({
      pages: [{ id: "a", name: "Overview", widgets: [use("cw"), use("cw"), use("x")] }, { id: "b", name: "Trends", widgets: [use("x")] }, { id: "c", name: "Process", widgets: [use("cw")] }],
      customWidgets: [
        { id: "cw", name: "Pump card", params: [], widgets: [] },
        { id: "tile", name: "Pump tile", params: [], widgets: [{ localId: "p", type: "customWidget", x: 0, y: 0, w: 1, h: 1, props: { customWidgetId: "cw" } }] },
        { id: "self", name: "Loop", params: [], widgets: [] },
      ] as unknown as Project["customWidgets"],
      shell: { frame: [{ id: "s1", customWidgetId: "cw", edge: "top" }, { id: "s2", customWidgetId: "other", edge: "left" }] } as unknown as Project["shell"],
    });
    expect(customWidgetUsage(project, "cw")).toEqual({
      pages: [{ id: "a", name: "Overview", count: 2 }, { id: "c", name: "Process", count: 1 }],
      customWidgets: ["Pump tile"],
      frame: 1,
      total: 5,
    });
  });
});
