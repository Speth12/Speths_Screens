// How the editor is showing the project right now, which is not part of the project: the language
// of the preview, and later the device, data source, user role and test mode. Nothing here is saved
// in the project file or sent to the runtime.
import { create } from "zustand";
import type { Device } from "@speths-screens/widgets";

interface EditorView {
  /** The language the canvas and preview draw in; null is the project's first. */
  language: string | null;
  setLanguage: (language: string | null) => void;
  /** The screen size being edited. Positions and sizes changed on a tablet or phone are stored in
   *  that size's layout; the desktop's are the widget's own. */
  device: Device;
  setDevice: (device: Device) => void;
  /** Where the canvas and preview get tag values: the runtime's, or made-up ones that need no PLC.
   *  With made-up values nothing is written to the runtime. */
  data: "live" | "dummy";
  setData: (data: "live" | "dummy") => void;
}

export const useEditorView = create<EditorView>((set) => ({
  language: null,
  setLanguage: (language) => set({ language }),
  device: "desktop",
  setDevice: (device) => set({ device }),
  data: "live",
  setData: (data) => set({ data }),
}));
