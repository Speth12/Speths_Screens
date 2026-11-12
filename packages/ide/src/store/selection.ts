// The widgets selected on the page being edited. The canvas and the object list both read and change
// it, so what is selected in one is selected in the other.
import { create } from "zustand";

type Selection = {
  ids: string[];
  set: (next: string[] | ((ids: string[]) => string[])) => void;
};

export const useSelection = create<Selection>((set) => ({
  ids: [],
  set: (next) => set((s) => ({ ids: typeof next === "function" ? next(s.ids) : next })),
}));
