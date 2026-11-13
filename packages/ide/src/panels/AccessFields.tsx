// Who may see and who may operate a page, a widget or a custom widget's part. Each is the lowest
// role; blank is everyone. The runtime refuses the writes of a role below operate; the screen hides
// what a role may not see.
import type { Access, Role } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { Field, Select } from "../ui";

const ROLES: { id: Role; label: string }[] = [
  { id: "operator", label: "Operators and above" },
  { id: "supervisor", label: "Supervisors and above" },
  { id: "engineer", label: "Engineers and above" },
  { id: "admin", label: "Administrators only" },
];

/** The access with one role changed; an access with nothing left is no access. */
export function withRole(access: Access | undefined, key: keyof Access, role: Role | undefined): Access | undefined {
  const next: Access = { ...access };
  if (role) next[key] = role;
  else delete next[key];
  return Object.keys(next).length ? next : undefined;
}

export function AccessFields({ what, access, onChange }: { what: string; access: Access | undefined; onChange: (next: Access | undefined) => void }) {
  const securityOff = useProject((s) => s.project.security?.mode !== "login");
  const select = (key: keyof Access, label: string, blank: string) => (
    <Field label={label}>
      <Select value={access?.[key] ?? ""} onChange={(e) => onChange(withRole(access, key, (e.target.value || undefined) as Role | undefined))}>
        <option value="">{blank}</option>
        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </Select>
    </Field>
  );
  return (
    <div role="group" aria-label={`Who can use this ${what}`} className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Access</div>
      <div className="grid grid-cols-2 gap-2">
        {select("view", "Who can see it", "Everyone")}
        {select("operate", "Who can use it", "Everyone who sees it")}
      </div>
      {securityOff && (access?.view || access?.operate) && (
        <div className="text-ui-label text-amber-300">
          Security is off, so everyone is an administrator and this has no effect yet. Turn on logins in Project properties, Settings.
        </div>
      )}
    </div>
  );
}
