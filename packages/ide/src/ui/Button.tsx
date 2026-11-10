// The IDE's buttons. Every button in the editor is one of these, so weight, size and focus look
// the same everywhere. Colors come from the editor's theme through the remapped zinc and blue scales.
import type { ComponentProps, ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

const BASE = `inline-flex items-center justify-center gap-1.5 rounded font-medium shrink-0 select-none whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING}`;

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-[var(--primary-foreground)] hover:bg-blue-700",
  secondary: "bg-zinc-800 text-zinc-100 border border-zinc-700 hover:border-zinc-500",
  ghost: "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
  danger: "bg-red-500 text-white hover:bg-red-700",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-ui-label",
  md: "h-8 px-3 text-ui",
};

const ICON_SIZE: Record<ButtonSize, string> = { sm: "h-6 w-6", md: "h-8 w-8" };

type ButtonProps = Omit<ComponentProps<"button">, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Drawn before the label. */
  icon?: ReactNode;
  /** A submit button inside a form; otherwise a click never submits. */
  submit?: boolean;
};

export function Button({ variant = "secondary", size = "md", icon, submit, className = "", children, ...rest }: ButtonProps) {
  return (
    <button type={submit ? "submit" : "button"} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "type" | "children" | "aria-label" | "title"> & {
  /** What the button does: its accessible name, and the tooltip a person sees. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A toggle that is on. */
  pressed?: boolean;
};

/** A button that shows only an icon. It always has a name: the label is read out and shown on hover. */
export function IconButton({ label, icon, variant = "ghost", size = "md", pressed, className = "", ...rest }: IconButtonProps) {
  return (
    <Tooltip text={label}>
      <button type="button" aria-label={label} aria-pressed={pressed}
        className={`${BASE} ${VARIANT[variant]} ${ICON_SIZE[size]} ${pressed ? "bg-zinc-800 text-zinc-100" : ""} ${className}`} {...rest}>
        {icon}
      </button>
    </Tooltip>
  );
}
