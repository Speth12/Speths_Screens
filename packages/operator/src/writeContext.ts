// Shared context so widgets can request a write through the confirmation dialog.
import { createContext, useContext } from "react";
import { writeTag } from "./writeTag";

export type WriteRequest = {
  binding: string;
  value: unknown;
  /** Optional human-readable description of the value (e.g. button label). */
  label?: string;
  /** The writing widget, so its min/max apply on the runtime. */
  widgetId?: string;
};

export type WriteConfirmFn = (req: WriteRequest) => void;

/** Widgets call this to request a write. App.tsx provides the implementation. */
export const WriteConfirmContext = createContext<WriteConfirmFn>(
  // Default: write directly without confirmation (used in standalone widget tests).
  async (req: WriteRequest) => {
    await writeTag(req.binding, req.value, req.widgetId);
  },
);

export function useWriteConfirm(): WriteConfirmFn {
  return useContext(WriteConfirmContext);
}

/** Navigate context — widgets call this to switch the active page by page ID. */
export const NavigateContext = createContext<(pageId: string) => void>(() => {});

export function useNavigate(): (pageId: string) => void {
  return useContext(NavigateContext);
}
