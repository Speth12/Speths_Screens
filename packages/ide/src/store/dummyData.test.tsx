import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { dummyState, dummyValue } from "./dummyData";
import { useEditorView } from "./editorView";
import { useProject } from "./projectStore";
import { ideHost } from "../widgets";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
beforeEach(() => useEditorView.setState({ data: "live" }));

describe("dummyValue", () => {
  it("is the same for the same path and moment", () => {
    expect(dummyValue("plc:Pressure", 123456)).toBe(dummyValue("plc:Pressure", 123456));
  });
  it("stays between 0 and 100 and keeps moving", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 60_000; t += 1000) {
      const v = dummyValue("plc:Level", t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(30);
  });
  it("gives each path its own wave", () => {
    expect(dummyValue("plc:A", 5000)).not.toBe(dummyValue("plc:B", 5000));
  });
  it("is a good-quality state", () => {
    expect(dummyState("plc:A", 1)).toMatchObject({ quality: "Good", ts: 1 });
  });
});

function Probe({ path }: { path: string }) {
  const s = ideHost.useTag(path);
  return <div data-testid="v">{`${s.quality}:${s.value}`}</div>;
}

describe("the IDE host with demo values", () => {
  it("live data shows what the runtime has: nothing here, so Unknown", () => {
    render(<Probe path="plc:Pressure" />);
    expect(screen.getByTestId("v").textContent).toBe("Unknown:null");
  });

  it("demo data shows a made-up good value that follows the clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    useEditorView.setState({ data: "dummy" });
    render(<Probe path="plc:Pressure" />);
    expect(screen.getByTestId("v").textContent).toBe(`Good:${dummyValue("plc:Pressure", 10_000)}`);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId("v").textContent).toBe(`Good:${dummyValue("plc:Pressure", 15_000)}`);
  });

  it("a session variable stays the tab's own, not made up", () => {
    useEditorView.setState({ data: "dummy" });
    render(<Probe path="session:mode" />);
    expect(screen.getByTestId("v").textContent).not.toMatch(/^Good:/);
  });

  it("a write with demo values never reaches the runtime", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    useProject.getState().loadProject({ schemaVersion: 5, version: "1", datasources: [], pages: [] });
    useEditorView.setState({ data: "dummy" });
    ideHost.write({ binding: "plc:Pump", value: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    useEditorView.setState({ data: "live" });
    ideHost.write({ binding: "plc:Pump", value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
