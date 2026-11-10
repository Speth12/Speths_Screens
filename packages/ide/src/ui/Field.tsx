// The IDE's form controls: a text input, a select and a checkbox that look alike, and a Field that
// gives any of them a label, a hint and an error tied to the control for screen readers.
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
import { FOCUS_RING } from "./Button";

const CONTROL = `w-full h-8 rounded border bg-zinc-950 px-2 text-ui text-zinc-100 placeholder:text-zinc-500 disabled:opacity-50 ${FOCUS_RING}`;
const border = (invalid?: boolean) => (invalid ? "border-red-500" : "border-zinc-700 hover:border-zinc-500");

type FieldIds = { id: string; describedBy?: string; invalid: boolean };
const FieldContext = createContext<FieldIds | null>(null);

type FieldProps = {
  label: string;
  /** One line of help under the control. */
  hint?: string;
  /** Why the value is refused. Shown in place of the hint and marks the control invalid. */
  error?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, className = "", children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-ui-label text-zinc-400">{label}</label>
      <FieldContext.Provider value={{ id, describedBy: note ? noteId : undefined, invalid: !!error }}>
        {children}
      </FieldContext.Provider>
      {note && (
        <div id={noteId} role={error ? "alert" : undefined} className={`text-ui-label ${error ? "text-red-500" : "text-zinc-500"}`}>{note}</div>
      )}
    </div>
  );
}

/** What a control takes from the Field around it, unless the caller set it. */
function useFieldProps(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: ComponentProps<"input">["aria-invalid"] }) {
  const field = useContext(FieldContext);
  return {
    id: props.id ?? field?.id,
    "aria-describedby": props["aria-describedby"] ?? field?.describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field?.invalid || undefined),
  };
}

type InputProps = ComponentProps<"input"> & {
  /** Addresses, expressions and ids read better in a fixed-width font. */
  mono?: boolean;
};

export function Input({ mono, className = "", ...rest }: InputProps) {
  const field = useFieldProps(rest);
  return <input {...rest} {...field} className={`${CONTROL} ${border(!!field["aria-invalid"])} ${mono ? "font-mono" : ""} ${className}`} />;
}

export function Select({ className = "", children, ...rest }: ComponentProps<"select">) {
  const field = useFieldProps(rest);
  return <select {...rest} {...field} className={`${CONTROL} ${border(!!field["aria-invalid"])} pr-1 ${className}`}>{children}</select>;
}

type CheckboxProps = Omit<ComponentProps<"input">, "type" | "children"> & { label: string };

/** A checkbox with its label; a click on either changes it. */
export function Checkbox({ label, className = "", ...rest }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 text-ui text-zinc-200 cursor-pointer ${rest.disabled ? "opacity-50 cursor-default" : ""} ${className}`}>
      <input type="checkbox" {...rest} className={`h-4 w-4 accent-[var(--primary)] ${FOCUS_RING}`} />
      {label}
    </label>
  );
}
