// A row of menus, like the top of a desktop program. Opening one and moving the pointer over another
// opens that one; Left and Right move between menus while one is open.
import { useState } from "react";
import { Menu, type MenuItem } from "./Menu";

export type MenuSpec = { label: string; items: MenuItem[] };

export function MenuBar({ label, menus, className = "" }: { label: string; menus: MenuSpec[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div role="menubar" aria-label={label} className={`flex items-center ${className}`}>
      {menus.map((m, i) => (
        <div key={m.label} onMouseEnter={() => setOpen((cur) => (cur !== null && cur !== i ? i : cur))}>
          <Menu label={m.label} items={m.items} open={open === i}
            onOpenChange={(o) => setOpen((cur) => (o ? i : cur === i ? null : cur))}
            onSideways={(dir) => setOpen((i + dir + menus.length) % menus.length)} />
        </div>
      ))}
    </div>
  );
}
