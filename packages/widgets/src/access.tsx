// Who may see and use what on a screen. A page, a widget and a custom widget's part can name the
// lowest role that may see it (access.view) and the lowest that may operate it (access.operate); a
// page's and a custom widget's access count for everything inside. Below the view role a widget is
// not drawn; below the operate role it is drawn but cannot be used. This is what the screen shows:
// the runtime refuses the writes itself (internal/runtime/write.go), so a hidden widget is not the
// only thing standing between a role and a tag.
import { createContext, useContext, type ReactNode } from "react";
import type { Access } from "@speths-screens/shared-types";
import { useHost, type UserInfo } from "./host";

const RANK: Record<string, number> = { operator: 1, supervisor: 2, engineer: 3, admin: 4 };
const NAMES = ["", "operator", "supervisor", "engineer", "admin"];

/** A role's rank, operator 1 to admin 4; none or an unknown role is 0. */
export const roleRank = (role: string | undefined) => (role ? RANK[role] ?? 0 : 0);

/** The role of a rank, for saying who may do something. */
export const roleName = (rank: number) => NAMES[rank] ?? "";

/** What the person looking at the screen may do: with security off everyone is an administrator. */
export function userRank(u: UserInfo): number {
  return u.loginRequired ? roleRank(u.role) : RANK.admin!;
}

export type Need = { view: number; operate: number };
const NOTHING: Need = { view: 0, operate: 0 };

/** The needs of something inside `outer` that has access `a`. What a role may not see it may not
 *  operate either, so operate is never below view. */
export function needInside(outer: Need, a: Access | undefined): Need {
  const view = Math.max(outer.view, roleRank(a?.view));
  return { view, operate: Math.max(outer.operate, view, roleRank(a?.operate)) };
}

/** The access of the page and the custom widgets around what is being drawn. */
export const AccessContext = createContext<Need>(NOTHING);

/** Puts a page's access around its widgets. */
export function PageAccess({ access, children }: { access: Access | undefined; children: ReactNode }) {
  const outer = useContext(AccessContext);
  return <AccessContext.Provider value={needInside(outer, access)}>{children}</AccessContext.Provider>;
}

/** May the person looking at the screen see something with this access (a page in the navigation)? */
export function canView(u: UserInfo, a: Access | undefined): boolean {
  return userRank(u) >= roleRank(a?.view);
}

/** Draws a widget as its access allows: not at all below its view role, greyed out and not usable
 *  below its operate role. What is inside it (a custom widget's parts) gets its access too. */
export function AccessGate({ access, children }: { access: Access | undefined; children: ReactNode }) {
  const outer = useContext(AccessContext);
  const rank = userRank(useHost().useUser());
  const need = needInside(outer, access);
  if (rank < need.view) return null;
  const inner = <AccessContext.Provider value={need}>{children}</AccessContext.Provider>;
  if (rank >= need.operate) return inner;
  const says = `Only ${roleName(need.operate)} and above can use this`;
  return (
    <div className="relative w-full h-full" data-access="locked" title={says} aria-disabled="true">
      <div className="w-full h-full" style={{ pointerEvents: "none" }}>{inner}</div>
      <div className="absolute inset-0 z-10 rounded-lg pointer-events-none" style={{ background: "color-mix(in srgb, var(--background) 45%, transparent)" }} />
    </div>
  );
}
