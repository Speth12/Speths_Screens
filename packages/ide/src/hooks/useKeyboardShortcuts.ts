// Global keyboard shortcut handler for the IDE.
// Mounted once in App — uses window event listeners.
import { useEffect } from "react";
import { useProject, type Widget } from "../store/projectStore";
import { newWidgetId } from "../store/projectStore";

// Module-level clipboard — survives page switches and effect re-runs.
let _clipboard: Widget | Widget[] | null = null;
export const getClipboard = () => _clipboard;
export const setClipboard = (w: Widget | Widget[] | null) => { _clipboard = w; };

export function useKeyboardShortcuts() {
  const { activePageId, selectedWidgetId, selectWidget, removeWidget, addWidget, project, exportJSON, undo, redo } = useProject();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when focus is inside an input/textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Delete / Backspace — remove selected widget
      if ((e.key === "Delete" || e.key === "Backspace") && selectedWidgetId) {
        removeWidget(activePageId, selectedWidgetId);
        return;
      }

      // Escape — deselect
      if (e.key === "Escape") {
        selectWidget(null);
        return;
      }

      // Ctrl/Cmd+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z — redo
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl/Cmd+S — save to file
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const blob = new Blob([exportJSON()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(project.name ?? "project").replace(/\s+/g, "-")}.xhmi.json`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      // Ctrl/Cmd+C — copy selected widget (works across pages)
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedWidgetId) {
        const page = project.pages.find((p) => p.id === activePageId);
        const w = page?.widgets.find((x) => x.id === selectedWidgetId);
        if (w) { setClipboard(w); }
        return;
      }

      // Ctrl/Cmd+D — duplicate selected widget
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedWidgetId) {
        e.preventDefault();
        const page = project.pages.find((p) => p.id === activePageId);
        const w = page?.widgets.find((x) => x.id === selectedWidgetId);
        if (w) {
          const nextY = page!.widgets.reduce((max, wg) => Math.max(max, wg.y + wg.h), 0);
          addWidget(activePageId, { ...w, id: newWidgetId(), y: nextY });
        }
        return;
      }

      // Ctrl/Cmd+V — paste widget(s) onto active page (cross-page supported)
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && _clipboard) {
        e.preventDefault();
        const page = project.pages.find((p) => p.id === activePageId);
        const nextY = page?.widgets.reduce((max, wg) => Math.max(max, wg.y + wg.h), 0) ?? 0;
        if (Array.isArray(_clipboard)) {
          _clipboard.forEach((w) => addWidget(activePageId, { ...w, id: newWidgetId(), y: nextY, locked: undefined }));
        } else {
          addWidget(activePageId, { ..._clipboard, id: newWidgetId(), y: nextY, locked: undefined });
        }
        return;
      }

      // ? — toggle help modal (fires a custom event the App listens to)
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        window.dispatchEvent(new CustomEvent("xhmi:toggleHelp"));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activePageId, selectedWidgetId, project, exportJSON, selectWidget, removeWidget, addWidget, undo, redo]);
}
