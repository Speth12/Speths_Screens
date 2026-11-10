// The Edit menu's selection commands. The canvas and the keyboard handler already know how to copy, paste,
// duplicate, delete and select widgets from the keyboard, so the menu presses the same key instead of
// doing it a second way that could drift from it.
export type EditCommand = "copy" | "paste" | "duplicate" | "delete" | "selectAll";

const KEYS: Record<EditCommand, { key: string; ctrlKey: boolean }> = {
  copy: { key: "c", ctrlKey: true },
  paste: { key: "v", ctrlKey: true },
  duplicate: { key: "d", ctrlKey: true },
  delete: { key: "Delete", ctrlKey: false },
  selectAll: { key: "a", ctrlKey: true },
};

/** The keys as they are written in the menu. */
export const EDIT_SHORTCUTS: Record<EditCommand, string> = {
  copy: "Ctrl+C", paste: "Ctrl+V", duplicate: "Ctrl+D", delete: "Del", selectAll: "Ctrl+A",
};

export function runEditCommand(command: EditCommand): void {
  const { key, ctrlKey } = KEYS[command];
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, bubbles: true, cancelable: true }));
}
