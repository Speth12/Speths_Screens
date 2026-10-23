// Shared context so widgets can request a write through the confirmation dialog.
import { createContext, useContext } from "react";

export type WriteRequest = {
  binding: string;
  value: unknown;
  /** Optional human-readable description of the value (e.g. button label). */
  label?: string;
};

export type WriteConfirmFn = (req: WriteRequest) => void;

/** Widgets call this to request a write. App.tsx provides the implementation. */
export const WriteConfirmContext = createContext<WriteConfirmFn>(
  // Default: write directly without confirmation (used in standalone widget tests).
  async (req: WriteRequest) => {
    const sep = req.binding.indexOf(":");
    if (sep < 0) return;
    const datasource = req.binding.slice(0, sep);
    const path = req.binding.slice(sep + 1);
    try {
      await fetch(`/api/v1/tag/${encodeURIComponent(path)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasource, value: req.value }),
      });
    } catch { /* ignore */ }
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
