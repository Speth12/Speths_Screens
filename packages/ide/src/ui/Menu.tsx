// A dropdown menu: a button that opens a list of actions. Arrow keys move through the items,
// Enter or Space runs one, Esc closes and returns to the button, and a click elsewhere closes it.
// The menu bar opens one of these per heading and may hold `open` itself, to move between them.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FOCUS_RING } from "./Button";

export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      onSelect: () => void;
      icon?: ReactNode;
      /** The keyboard shortcut, shown at the right ("Ctrl+S"). The menu only shows it. */
      shortcut?: string;
      disabled?: boolean;
      /** Set for an item that is a choice: true draws a check mark, false leaves room for one. */
      checked?: boolean;
    };

type MenuProps = {
  /** The text of the button that opens the menu. */
  label: string;
  items: MenuItem[];
  /** Replaces the label as the button's content (an icon, say); the label stays its name. */
  trigger?: ReactNode;
  align?: "left" | "right";
  /** Held by the parent when it needs to (a menu bar); otherwise the menu keeps it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Left and right arrows inside an open menu, for a menu bar to move to its neighbor. */
  onSideways?: (dir: -1 | 1) => void;
  className?: string;
};

const isAction = (it: MenuItem): it is Exclude<MenuItem, { separator: true }> => !it.separator;

export function Menu({ label, items, trigger, align = "left", open: held, onOpenChange, onSideways, className = "" }: MenuProps) {
  const [own, setOwn] = useState(false);
  const open = held ?? own;
  const setOpen = (v: boolean) => { if (held === undefined) setOwn(v); onOpenChange?.(v); };
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  const usable = items.map((it, i) => (isAction(it) && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    if (!open) { setActive(-1); return; }
    list.current?.focus();
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) { if (held === undefined) setOwn(false); onOpenChange?.(false); }
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the menu opens or closes, not when a parent re-renders

  const closeToButton = () => { setOpen(false); button.current?.focus(); };
  const run = (i: number) => {
    const it = items[i];
    if (!it || !isAction(it) || it.disabled) return;
    closeToButton();
    it.onSelect();
  };
  const step = (dir: -1 | 1) => {
    if (usable.length === 0) return;
    const at = usable.indexOf(active);
    setActive(usable[(at + dir + usable.length) % usable.length] ?? usable[0]!);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); if (active < 0) setActive(usable[0] ?? -1); else step(1); break;
      case "ArrowUp": e.preventDefault(); if (active < 0) setActive(usable[usable.length - 1] ?? -1); else step(-1); break;
      case "Home": e.preventDefault(); setActive(usable[0] ?? -1); break;
      case "End": e.preventDefault(); setActive(usable[usable.length - 1] ?? -1); break;
      case "Enter": case " ": e.preventDefault(); if (active >= 0) run(active); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); closeToButton(); break;
      case "Tab": setOpen(false); break;
      case "ArrowLeft": if (onSideways) { e.preventDefault(); onSideways(-1); } break;
      case "ArrowRight": if (onSideways) { e.preventDefault(); onSideways(1); } break;
    }
  };

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((e.key === "ArrowDown" ? usable[0] : usable[usable.length - 1]) ?? -1);
    }
  };

  const hasChecks = items.some((it) => isAction(it) && it.checked !== undefined);

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        aria-label={trigger ? label : undefined}
        onClick={() => setOpen(!open)} onKeyDown={onButtonKey}
        className={`h-7 px-2 rounded text-ui inline-flex items-center gap-1 ${open ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"} ${FOCUS_RING}`}>
        {trigger ?? label}
      </button>
      {open && (
        <div ref={list} id={id} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onListKey}
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          className={`absolute top-full mt-1 z-50 min-w-48 rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl outline-none ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it, i) => {
            if (!isAction(it)) return <div key={i} role="separator" className="my-1 border-t border-zinc-700" />;
            const choice = it.checked !== undefined;
            return (
              <div key={i} id={`${id}-${i}`} role={choice ? "menuitemcheckbox" : "menuitem"} aria-checked={choice ? it.checked : undefined}
                aria-disabled={it.disabled || undefined}
                onMouseEnter={() => !it.disabled && setActive(i)} onClick={() => run(i)}
                className={`flex items-center gap-2 px-3 h-7 text-ui whitespace-nowrap ${it.disabled ? "text-zinc-500 opacity-60" : "text-zinc-100 cursor-pointer"} ${active === i ? "bg-zinc-800" : ""}`}>
                {hasChecks && (
                  <span className="w-3.5 shrink-0" aria-hidden="true">
                    {it.checked && (
                      <svg viewBox="0 0 16 16" width="14" height="14" style={{ stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }}>
                        <path d="M3 8.5l3.2 3.2L13 4.8" />
                      </svg>
                    )}
                  </span>
                )}
                {it.icon && <span className="shrink-0 inline-flex" aria-hidden="true">{it.icon}</span>}
                <span className="flex-1">{it.label}</span>
                {it.shortcut && <span className="pl-6 text-ui-label text-zinc-500">{it.shortcut}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
