import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BindingInput } from "./BindingInput";
import { useProject, type Project } from "../store/projectStore";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const load = () => useProject.getState().loadProject({
  schemaVersion: 2, version: "1", pages: [{ id: "p1", name: "Main", widgets: [] }],
  datasources: [{ id: "plc", label: "plc", type: "rest", url: "" } as unknown as Project["datasources"][number]],
  namespace: [{ path: "plant.temp", type: "tag", driverId: "plc", driverAddr: "rTemp", description: "Tank temperature" }],
});

describe("BindingInput", () => {
  it("suggests namespace tags without typing ns: first", () => {
    load();
    const onChange = vi.fn();
    render(<BindingInput value="tank" onChange={onChange} />);
    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.mouseDown(screen.getByText("plant.temp"));
    expect(onChange).toHaveBeenLastCalledWith("ns:plant.temp");
  });

  it("offers the namespace path for a raw path the namespace has", () => {
    load();
    const onChange = vi.fn();
    render(<BindingInput value="plc:rTemp" onChange={onChange} />);
    fireEvent.click(screen.getByText("◆ use ns:plant.temp"));
    expect(onChange).toHaveBeenLastCalledWith("ns:plant.temp");
  });

  it("adds a raw path to the namespace in one step", async () => {
    load();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const onChange = vi.fn();
    render(<BindingInput value="plc:Arp.Plc.Eclr/xRun" onChange={onChange} />);
    fireEvent.click(screen.getByText("⊕ add to namespace as plc.xRun"));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("ns:plc.xRun"));
    expect(useProject.getState().project.namespace).toContainEqual({ path: "plc.xRun", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/xRun" });
  });

  it.each([
    ["an ns: path", "ns:plant.temp"],
    ["an unknown datasource", "other:rTemp"],
    ["a datasource with no address yet", "plc:"],
  ])("offers nothing extra for %s", (_, value) => {
    load();
    render(<BindingInput value={value} onChange={vi.fn()} />);
    expect(screen.queryByText(/use ns:|add to namespace/)).toBeNull();
  });
});
