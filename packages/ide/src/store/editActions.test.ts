// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EDIT_SHORTCUTS, runEditCommand, type EditCommand } from "./editActions";

describe("runEditCommand", () => {
  it.each<[EditCommand, string, boolean, boolean?]>([
    ["copy", "c", true],
    ["paste", "v", true],
    ["duplicate", "d", true],
    ["delete", "Delete", false],
    ["selectAll", "a", true],
    ["toFront", "]", true, true],
    ["forward", "]", true],
    ["backward", "[", true],
    ["toBack", "[", true, true],
  ])("%s presses %s (with Ctrl: %s) on the window", (command, key, ctrl, shift = false) => {
    const seen: KeyboardEvent[] = [];
    const on = (e: KeyboardEvent) => seen.push(e);
    window.addEventListener("keydown", on);
    runEditCommand(command);
    window.removeEventListener("keydown", on);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ key, ctrlKey: ctrl, metaKey: false, shiftKey: shift });
  });

  it("says each command's key as the menu shows it", () => {
    expect(EDIT_SHORTCUTS).toEqual({
      copy: "Ctrl+C", paste: "Ctrl+V", duplicate: "Ctrl+D", delete: "Del", selectAll: "Ctrl+A",
      toFront: "Ctrl+Shift+]", forward: "Ctrl+]", backward: "Ctrl+[", toBack: "Ctrl+Shift+[",
    });
  });
});
