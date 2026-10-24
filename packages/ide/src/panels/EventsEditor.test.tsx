import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EventsEditor, cleanEvents } from "./EventsEditor";
import { WidgetPalette } from "./Palette";
import { useProject, type Widget } from "../store/projectStore";

afterEach(cleanup);

const button = (events?: Widget["events"]) => ({ id: "b", type: "button", x: 0, y: 0, w: 2, h: 2, events }) as Widget;

describe("EventsEditor", () => {
  it("adds an action to an event", () => {
    const onChange = vi.fn();
    render(<EventsEditor w={button()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Add action On press"), { target: { value: "write" } });
    expect(onChange).toHaveBeenLastCalledWith({ onPress: [{ type: "write" }] });
  });

  it("edits an action's fields", () => {
    const onChange = vi.fn();
    render(<EventsEditor w={button({ onClick: [{ type: "toggle" }] })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("On click 1 On value"), { target: { value: "true" } });
    expect(onChange).toHaveBeenLastCalledWith({ onClick: [{ type: "toggle", on: "true" }] });
    fireEvent.change(screen.getByLabelText("On click 1 Off value"), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith({ onClick: [{ type: "toggle", off: 0 }] });
  });

  it("changing the type starts the action over", () => {
    const onChange = vi.fn();
    render(<EventsEditor w={button({ onClick: [{ type: "write", value: 1 }] })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("On click 1 type"), { target: { value: "openUrl" } });
    expect(onChange).toHaveBeenLastCalledWith({ onClick: [{ type: "openUrl" }] });
  });

  it("removing the last action removes the events", () => {
    const onChange = vi.fn();
    render(<EventsEditor w={button({ onRelease: [{ type: "write", value: 0 }] })} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove On release 1"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("cleanEvents drops empty lists", () => {
    expect(cleanEvents({ onClick: [], onPress: [{ type: "write" }] })).toEqual({ onPress: [{ type: "write" }] });
    expect(cleanEvents({ onClick: [] })).toBeUndefined();
  });
});

describe("palette", () => {
  it("a new button writes 1 while pressed", () => {
    useProject.getState().loadProject({ schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }] });
    render(<WidgetPalette />);
    fireEvent.click(screen.getByText("Button"));
    expect(useProject.getState().project.pages[0]!.widgets[0]).toMatchObject({
      type: "button", events: { onPress: [{ type: "write", value: 1 }], onRelease: [{ type: "write", value: 0 }] },
    });
  });
});
