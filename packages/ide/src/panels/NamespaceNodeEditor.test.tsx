// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NamespaceNodeEditor, type NodeSource } from "./NamespaceNodeEditor";

afterEach(cleanup);

const SOURCES: NodeSource[] = [
  { id: "plc", label: "PLC", type: "rest" },
  { id: "mem", label: "Script state", type: "memory", memoryTags: ["Counter"] },
];

function open(start: { path: string } & Record<string, unknown> = { path: "" }, sources = SOURCES) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<NamespaceNodeEditor node={start} datasources={sources} onSave={onSave} onCancel={onCancel} />);
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  return { onSave, onCancel, type, save: () => fireEvent.click(screen.getByRole("button", { name: "Save" })) };
}

describe("a node from an ordinary datasource", () => {
  it("asks for the driver address, and saves a node with the data type chosen", () => {
    const f = open();
    f.type("Path (dot-separated)", "Plant.Temp");
    f.type("Driver", "plc");
    f.type("Driver address (tag path in datasource)", "Arp.Plc.Eclr/rTemp");
    f.type("Unit", "°C");
    f.type("Data type", "float");
    f.save();
    expect(f.onSave).toHaveBeenCalledWith({ path: "Plant.Temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp", unit: "°C", dataType: "float", description: undefined }, undefined);
    expect(screen.queryByText(/memory variable/i)).toBeNull();
  });

  it("a folder asks for no driver", () => {
    const f = open();
    f.type("Type", "folder");
    expect(screen.queryByLabelText("Driver")).toBeNull();
    f.type("Path (dot-separated)", "Plant");
    f.save();
    expect(f.onSave.mock.calls[0]![0]).toMatchObject({ path: "Plant", type: "folder", driverId: undefined });
  });

  it("needs a path", () => {
    const f = open();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Give the node a path.")).toBeTruthy();
    f.type("Path (dot-separated)", "x");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Cancel closes it", () => {
    const f = open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(f.onCancel).toHaveBeenCalled();
  });
});

describe("a new node from a memory datasource makes the memory variable", () => {
  const memory = () => {
    const f = open();
    f.type("Path (dot-separated)", "Virtual_Real");
    f.type("Driver", "mem");
    return f;
  };

  it("asks for the variable's type, starting value and whether to keep it, and names it like the node", () => {
    memory();
    expect(screen.getByText("New memory variable in Script state")).toBeTruthy();
    expect((screen.getByLabelText("Variable name in the datasource") as HTMLInputElement).placeholder).toBe("Virtual_Real");
    expect((screen.getByLabelText("Variable type") as HTMLSelectElement).value).toBe("real");
    expect(screen.getByRole("checkbox", { name: "Keep the value when the runtime restarts" })).toBeTruthy();
    expect(screen.getByText("Saving adds it to Script state. Deploy the project to make it live.")).toBeTruthy();
  });

  it("saves the node and the variable together, with the namespace's data type from the variable's type", () => {
    const f = memory();
    f.type("Variable type", "int");
    f.type("Starting value", "7");
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep the value when the runtime restarts" }));
    f.save();
    expect(f.onSave).toHaveBeenCalledWith(
      { path: "Virtual_Real", type: "tag", driverId: "mem", driverAddr: "Virtual_Real", dataType: "int", description: undefined, unit: undefined },
      { path: "Virtual_Real", type: "int", initial: 7, retain: true },
    );
  });

  it.each<[string, string, unknown]>([
    ["real", "float", undefined],
    ["bool", "bool", undefined],
    ["string", "string", undefined],
  ])("a %s variable has the namespace type %s", (type, ns) => {
    const f = memory();
    f.type("Variable type", type);
    f.save();
    expect(f.onSave.mock.calls[0]![0].dataType).toBe(ns);
    expect(f.onSave.mock.calls[0]![1]).toEqual({ path: "Virtual_Real", type });
  });

  it("a name typed in the address field is used instead of the node's", () => {
    const f = memory();
    f.type("Variable name in the datasource", "Real_Var");
    f.save();
    expect(f.onSave.mock.calls[0]![0].driverAddr).toBe("Real_Var");
    expect(f.onSave.mock.calls[0]![1]).toMatchObject({ path: "Real_Var" });
  });

  it("takes the last level of a nested path as the variable's name", () => {
    const f = open();
    f.type("Path (dot-separated)", "Plant.Line1.Batch");
    f.type("Driver", "mem");
    f.save();
    expect(f.onSave.mock.calls[0]![1]).toMatchObject({ path: "Batch" });
  });

  it.each<[string, string, string]>([
    ["int", "2.5", "a whole number"],
    ["real", "abc", "a number with decimals"],
    ["bool", "maybe", "true or false"],
  ])("refuses a starting value that is not a %s ('%s')", (type, value, words) => {
    const f = memory();
    f.type("Variable type", type);
    f.type("Starting value", value);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(`Not ${words}.`).length).toBeGreaterThan(0);
    f.save();
    expect(f.onSave).not.toHaveBeenCalled();
  });

  it("a blank starting value is left out, so it starts at false, 0 or empty", () => {
    const f = memory();
    f.save();
    expect(f.onSave.mock.calls[0]![1]).toEqual({ path: "Virtual_Real", type: "real" });
  });

  it("a variable the datasource already has is not made again; the node points at it", () => {
    const f = open();
    f.type("Path (dot-separated)", "Count");
    f.type("Driver", "mem");
    f.type("Variable name in the datasource", "Counter");
    expect(screen.getByText("Script state already has a variable named Counter; this node will point at it.")).toBeTruthy();
    expect(screen.queryByText("New memory variable in Script state")).toBeNull();
    f.save();
    expect(f.onSave.mock.calls[0]![0]).toMatchObject({ driverId: "mem", driverAddr: "Counter" });
    expect(f.onSave.mock.calls[0]![1]).toBeUndefined();
  });

  it("a virtual node from a memory datasource makes the variable too", () => {
    const f = open();
    f.type("Type", "virtual");
    f.type("Path (dot-separated)", "V");
    f.type("Driver", "mem");
    f.save();
    expect(f.onSave.mock.calls[0]![0]).toMatchObject({ type: "virtual", driverAddr: "V" });
    expect(f.onSave.mock.calls[0]![1]).toMatchObject({ path: "V" });
  });

  it("changing the driver away from memory takes the variable fields away", () => {
    const f = memory();
    f.type("Driver", "plc");
    expect(screen.queryByText("New memory variable in Script state")).toBeNull();
    expect(screen.getByLabelText("Data type")).toBeTruthy();
  });
});

describe("editing a node", () => {
  it("a node that is already saved gets no memory variable fields, whatever its driver", () => {
    open({ path: "Count", type: "tag", driverId: "mem", driverAddr: "Counter" });
    expect(screen.getByText("Edit node")).toBeTruthy();
    expect(screen.queryByText(/New memory variable/)).toBeNull();
    expect((screen.getByLabelText("Path (dot-separated)") as HTMLInputElement).disabled).toBe(true);
  });
});
