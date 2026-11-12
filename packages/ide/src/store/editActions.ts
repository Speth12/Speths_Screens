// The Edit menu's selection commands. The canvas and the keyboard handler already know how to copy, paste,
// duplicate, delete and select widgets from the keyboard, so the menu presses the same key instead of
// doing it a second way that could drift from it.
export type EditCommand = "copy" | "paste" | "duplicate" | "delete" | "selectAll" | "toFront" | "forward" | "backward" | "toBack";

const KEYS: Record<EditCommand, { key: string; ctrlKey: boolean; shiftKey?: boolean }> = {
  copy: { key: "c", ctrlKey: true },
  paste: { key: "v", ctrlKey: true },
  duplicate: { key: "d", ctrlKey: true },
  delete: { key: "Delete", ctrlKey: false },
  selectAll: { key: "a", ctrlKey: true },
  // Which widget is drawn over which: the keys drawing tools use.
  toFront: { key: "]", ctrlKey: true, shiftKey: true },
  forward: { key: "]", ctrlKey: true },
  backward: { key: "[", ctrlKey: true },
  toBack: { key: "[", ctrlKey: true, shiftKey: true },
};

/** The keys as they are written in the menu. */
export const EDIT_SHORTCUTS: Record<EditCommand, string> = {
  copy: "Ctrl+C", paste: "Ctrl+V", duplicate: "Ctrl+D", delete: "Del", selectAll: "Ctrl+A",
  toFront: "Ctrl+Shift+]", forward: "Ctrl+]", backward: "Ctrl+[", toBack: "Ctrl+Shift+[",
};

export function runEditCommand(command: EditCommand): void {
  const { key, ctrlKey, shiftKey } = KEYS[command];
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, shiftKey: !!shiftKey, bubbles: true, cancelable: true }));
}
