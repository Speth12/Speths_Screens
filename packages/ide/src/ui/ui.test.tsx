import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Badge, Button, Checkbox, Dialog, Field, IconButton, Input, Menu, SectionHeader, Select, Tabs, type MenuItem } from "./index";

afterEach(cleanup);

const dot = <svg data-testid="icon" />;

describe("Button", () => {
  it.each([
    ["a plain button never submits a form", {}, "button"],
    ["a submit button does", { submit: true }, "submit"],
  ])("%s", (_, props, type) => {
    render(<Button {...props}>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe(type);
  });

  it("runs its action on a click, and not when disabled", () => {
    const on = vi.fn();
    const { rerender } = render(<Button onClick={on}>Deploy</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    expect(on).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={on} disabled>Deploy</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("draws its icon beside the label, and the label stays the name", () => {
    render(<Button icon={dot}>Pull</Button>);
    const b = screen.getByRole("button", { name: "Pull" });
    expect(b.contains(screen.getByTestId("icon"))).toBe(true);
  });
});

describe("IconButton", () => {
  it("is named by its label and shows it on hover and on keyboard focus", () => {
    render(<IconButton label="Undo" icon={dot} />);
    const b = screen.getByRole("button", { name: "Undo" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(b.parentElement!);
    expect(screen.getByRole("tooltip").textContent).toBe("Undo");
    fireEvent.mouseLeave(b.parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(b);
    expect(screen.getByRole("tooltip").textContent).toBe("Undo");
  });

  it.each([
    ["on", true, "true"],
    ["off", false, "false"],
    ["not a toggle", undefined, null],
  ])("says whether a toggle is %s", (_, pressed, want) => {
    render(<IconButton label="Grid" icon={dot} pressed={pressed} />);
    expect(screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed")).toBe(want);
  });
});

describe("Field", () => {
  it("ties its label and hint to the control", () => {
    render(<Field label="Host" hint="The controller's address"><Input defaultValue="10.0.0.210" /></Field>);
    const input = screen.getByLabelText("Host") as HTMLInputElement;
    expect(input.value).toBe("10.0.0.210");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)!.textContent).toBe("The controller's address");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("shows an error in place of the hint and marks the control invalid", () => {
    render(<Field label="Port" hint="1 to 65535" error="Port must be a number"><Input defaultValue="x" /></Field>);
    const input = screen.getByLabelText("Port");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Port must be a number");
    expect(screen.queryByText("1 to 65535")).toBeNull();
  });

  it("labels a select the same way", () => {
    render(<Field label="Mode"><Select defaultValue="b"><option value="a">A</option><option value="b">B</option></Select></Field>);
    expect((screen.getByLabelText("Mode") as HTMLSelectElement).value).toBe("b");
  });

  it("a control outside a Field keeps the id it was given", () => {
    render(<Input id="own" aria-label="Search" />);
    expect(screen.getByLabelText("Search").id).toBe("own");
  });
});

describe("Checkbox", () => {
  it("changes on a click of its label", () => {
    const on = vi.fn();
    render(<Checkbox label="Writable" onChange={on} />);
    fireEvent.click(screen.getByText("Writable"));
    expect(on).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("checkbox", { name: "Writable" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("Dialog", () => {
  function Harness({ onClose, closeOnBackdrop }: { onClose: () => void; closeOnBackdrop?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        {open && (
          <Dialog title="New project" closeOnBackdrop={closeOnBackdrop} onClose={() => { onClose(); setOpen(false); }}
            footer={<><Button>Cancel</Button><Button variant="primary">Create</Button></>}>
            <Input aria-label="Name" />
          </Dialog>
        )}
      </>
    );
  }
  const open = (props: { closeOnBackdrop?: boolean } = {}) => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} {...props} />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    return { onClose, opener, dialog: screen.getByRole("dialog", { name: "New project" }) };
  };

  it("is a modal dialog named by its title, with focus on its first control", () => {
    const { dialog } = open();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("closes on Esc and gives focus back to what opened it", () => {
    const { onClose, opener, dialog } = open();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes from its close button", () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["closes on a click outside", undefined, 1],
    ["stays open on a click outside when told to", false, 0],
  ])("%s", (_, closeOnBackdrop, calls) => {
    const { onClose, dialog } = open({ closeOnBackdrop });
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(0);
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(calls);
  });

  it("keeps Tab inside: past the last control comes the first, and back", () => {
    const { dialog } = open();
    const close = screen.getByRole("button", { name: "Close" });
    const create = screen.getByRole("button", { name: "Create" });
    create.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(create);
  });

  it("takes the focus itself when it has no controls in its body", () => {
    render(<Dialog title="About" onClose={() => {}}>Speth's Screens</Dialog>);
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "About" }));
  });
});

describe("Menu", () => {
  const setup = (extra: Partial<Parameters<typeof Menu>[0]> = {}) => {
    const ran: string[] = [];
    const items: MenuItem[] = [
      { label: "New", onSelect: () => ran.push("new"), shortcut: "Ctrl+N" },
      { label: "Open", onSelect: () => ran.push("open"), disabled: true },
      { separator: true },
      { label: "Save", onSelect: () => ran.push("save"), shortcut: "Ctrl+S" },
    ];
    render(<Menu label="File" items={items} {...extra} />);
    return { ran, button: screen.getByRole("button", { name: "File" }) };
  };
  const activeLabel = () => {
    const id = screen.getByRole("menu").getAttribute("aria-activedescendant");
    return id ? document.getElementById(id)!.textContent : null;
  };

  it("opens on a click, lists its items and says it is open", () => {
    const { button } = setup();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["NewCtrl+N", "Open", "SaveCtrl+S"]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("menu"));
  });

  it("runs an item on a click and closes", () => {
    const { ran, button } = setup();
    fireEvent.click(button);
    fireEvent.click(screen.getByText("Save"));
    expect(ran).toEqual(["save"]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("does not run a disabled item", () => {
    const { ran, button } = setup();
    fireEvent.click(button);
    fireEvent.click(screen.getByText("Open"));
    expect(ran).toEqual([]);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("moves with the arrow keys, skipping disabled items and separators, and wraps", () => {
    const { ran, button } = setup();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    expect(activeLabel()).toBe("NewCtrl+N");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(activeLabel()).toBe("SaveCtrl+S");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(activeLabel()).toBe("NewCtrl+N");
    fireEvent.keyDown(menu, { key: "End" });
    expect(activeLabel()).toBe("SaveCtrl+S");
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(ran).toEqual(["save"]);
  });

  it("closes on Esc, back to its button, and on a click elsewhere", () => {
    const { button } = setup();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks choices as checked or not", () => {
    render(<Menu label="View" items={[
      { label: "Live data", onSelect: () => {}, checked: true },
      { label: "Demo data", onSelect: () => {}, checked: false },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getAllByRole("menuitemcheckbox").map((el) => el.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("lets a parent hold it open and hear the sideways arrows", () => {
    const onOpenChange = vi.fn();
    const onSideways = vi.fn();
    setup({ open: true, onOpenChange, onSideways });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    fireEvent.keyDown(menu, { key: "ArrowLeft" });
    expect(onSideways.mock.calls).toEqual([[1], [-1]]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("menu")).toBeTruthy(); // the parent decides
  });

  it("keeps its name when the button shows an icon", () => {
    render(<Menu label="More" trigger={dot} items={[{ label: "About", onSelect: () => {} }]} />);
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });
});

describe("Tabs", () => {
  const TABS = [
    { id: "screen", label: "Screen" },
    { id: "vars", label: "Variables", closable: true },
    { id: "pages", label: "Pages", closable: true },
  ];
  function Harness({ onClose }: { onClose: (id: string) => void }) {
    const [active, setActive] = useState("screen");
    return <Tabs label="Workspace" tabs={TABS} active={active} onSelect={setActive} onClose={onClose} />;
  }
  const selected = () => screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);

  it("marks the open tab and switches on a click", () => {
    render(<Harness onClose={() => {}} />);
    expect(screen.getByRole("tablist", { name: "Workspace" })).toBeTruthy();
    expect(selected()).toEqual(["Screen"]);
    fireEvent.click(screen.getByRole("tab", { name: "Pages" }));
    expect(selected()).toEqual(["Pages"]);
  });

  it.each([
    ["ArrowRight", "Variables"],
    ["ArrowLeft", "Pages"],
    ["End", "Pages"],
    ["Home", "Screen"],
  ])("%s from the first tab opens %s and moves the focus there", (key, want) => {
    render(<Harness onClose={() => {}} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Screen" }), { key });
    expect(selected()).toEqual([want]);
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: want }));
  });

  it("only the open tab is a Tab stop", () => {
    render(<Harness onClose={() => {}} />);
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("closes a closable tab from its button or with Delete, and never one that is not", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(screen.queryByRole("button", { name: "Close Screen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close Variables" }));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Pages" }), { key: "Delete" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Screen" }), { key: "Delete" });
    expect(onClose.mock.calls).toEqual([["vars"], ["pages"]]);
  });
});

describe("Badge and SectionHeader", () => {
  it("shows a section's title, its count and its actions", () => {
    render(<SectionHeader title="Pages" count={9} actions={<Button size="sm">Add</Button>} />);
    expect(screen.getByRole("heading", { name: "Pages" })).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("leaves the count out when there is none, and shows a zero", () => {
    const { rerender } = render(<SectionHeader title="Alarms" />);
    expect(screen.queryByText("0")).toBeNull();
    rerender(<SectionHeader title="Alarms" count={0} />);
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("a badge says its state in words", () => {
    render(<Badge tone="danger">3 alarms</Badge>);
    expect(screen.getByText("3 alarms")).toBeTruthy();
  });
});
