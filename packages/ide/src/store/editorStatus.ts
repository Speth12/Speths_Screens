// The last thing the editor has to say about what a person just did (saved, deployed, opened with
// these upgrade notes, could not pull). One line, shown in the header; a long message can be opened
// as a list. Not part of the project.
import { create } from "zustand";

interface EditorStatus {
  message: string;
  say: (message: string) => void;
}

export const useEditorStatus = create<EditorStatus>((set) => ({
  message: "",
  say: (message) => set({ message }),
}));

/** Says something from code that is not a component. */
export const say = (message: string): void => useEditorStatus.getState().say(message);
