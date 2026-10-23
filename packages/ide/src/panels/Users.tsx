import { useEffect, useState } from "react";
import { apiBase } from "../store/runtimeTarget";

type Role = "operator" | "supervisor" | "engineer" | "admin";
type User = { username: string; role: Role; enabled: boolean };

// ── Security level definitions ─────────────────────────────────────────────

type LevelDef = {
  role: Role;
  level: number;
  label: string;
  color: string;         // Tailwind text color
  bg: string;            // Tailwind bg color
  border: string;        // Tailwind border color
  perms: string[];
};

const LEVELS: LevelDef[] = [
  {
    role: "operator",
    level: 1,
    label: "Operator",
    color: "text-zinc-200",
    bg: "bg-zinc-800",
    border: "border-zinc-600",
    perms: ["View tag values", "Acknowledge alarms"],
  },
  {
    role: "supervisor",
    level: 2,
    label: "Supervisor",
    color: "text-blue-300",
    bg: "bg-blue-950/40",
    border: "border-blue-700",
    perms: ["View tag values", "Write tag values", "Acknowledge alarms"],
  },
  {
    role: "engineer",
    level: 3,
    label: "Engineer",
    color: "text-violet-300",
    bg: "bg-violet-950/40",
    border: "border-violet-700",
    perms: ["View + write tags", "Acknowledge alarms", "Apply recipes", "Deploy projects"],
  },
  {
    role: "admin",
    level: 4,
    label: "Admin",
    color: "text-amber-300",
    bg: "bg-amber-950/30",
    border: "border-amber-700",
    perms: ["Full access", "Manage users", "Deploy projects", "All operator permissions"],
  },
];

function levelOf(role: Role): LevelDef {
  return LEVELS.find(l => l.role === role) ?? LEVELS[0]!;
}

// ── API helpers ────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${apiBase}/api/v1/users${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

// ── Level picker ───────────────────────────────────────────────────────────

function LevelPicker({
  value,
  onChange,
}: {
  value: Role;
  onChange: (r: Role) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {LEVELS.map(l => (
        <button
          key={l.role}
          onClick={() => onChange(l.role)}
          className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-all ${
            value === l.role
              ? `${l.bg} ${l.border} ring-1 ring-inset ${l.border}`
              : "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
          }`}
        >
          <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
            value === l.role ? `${l.bg} ${l.color} border ${l.border}` : "bg-zinc-800 text-zinc-500 border border-zinc-700"
          }`}>
            {l.level}
          </div>
          <div>
            <div className={`text-[11px] font-semibold ${value === l.role ? l.color : "text-zinc-400"}`}>
              {l.label}
            </div>
            <div className="text-[9px] text-zinc-500 mt-0.5 leading-tight">
              {l.perms[0]}{l.perms.length > 1 ? ` +${l.perms.length - 1}` : ""}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Permission list ────────────────────────────────────────────────────────

function PermList({ role }: { role: Role }) {
  const l = levelOf(role);
  return (
    <div className={`rounded-lg border ${l.border} ${l.bg} px-3 py-2`}>
      <div className={`text-[10px] font-semibold ${l.color} mb-1.5 flex items-center gap-1.5`}>
        <span className="w-4 h-4 rounded-full border inline-flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ borderColor: "currentColor" }}>
          {l.level}
        </span>
        {l.label}
      </div>
      <ul className="space-y-0.5">
        {l.perms.map(p => (
          <li key={p} className="flex items-center gap-1.5 text-[10px] text-zinc-300">
            <span className={`${l.color} text-[8px]`}>✓</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function Users() {
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [view, setView]       = useState<"users" | "levels">("users");

  // Add-user form
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<Role>("operator");
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Inline state per user
  const [pwdUser, setPwdUser]     = useState<string | null>(null);
  const [pwdDraft, setPwdDraft]   = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdErr, setPwdErr]       = useState("");
  const [editRole, setEditRole]   = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api("GET", "/")
      .then((d: User[]) => { setUsers(d ?? []); setError(""); })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addUser = async () => {
    if (!newUser.trim() || !newPass.trim()) return;
    setSaving(true); setSaveErr("");
    try {
      await api("POST", "/", { username: newUser.trim(), password: newPass, role: newRole });
      setNewUser(""); setNewPass(""); setNewRole("operator"); setShowAdd(false);
      load();
    } catch (e) { setSaveErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const setRole = async (username: string, role: Role) => {
    try { await api("PUT", `/${username}/role`, { role }); load(); setEditRole(null); }
    catch (e) { setError((e as Error).message); }
  };

  const toggleEnabled = async (u: User) => {
    try { await api("PUT", `/${u.username}/enabled`, { enabled: !u.enabled }); load(); }
    catch (e) { setError((e as Error).message); }
  };

  const deleteUser = async (username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    try { await api("DELETE", `/${username}`); load(); }
    catch (e) { setError((e as Error).message); }
  };

  const changePassword = async (username: string) => {
    if (!pwdDraft.trim()) return;
    setPwdSaving(true); setPwdErr("");
    try {
      await api("PUT", `/${username}/password`, { password: pwdDraft });
      setPwdUser(null); setPwdDraft("");
    } catch (e) { setPwdErr((e as Error).message); }
    finally { setPwdSaving(false); }
  };

  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500 text-zinc-200";
  const devMode = error.includes("503") || error.includes("security not configured");

  return (
    <div className="flex flex-col min-h-0">
      {/* Sub-nav */}
      <div className="flex border-b border-zinc-800 shrink-0">
        {(["users", "levels"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
              view === v ? "text-zinc-100 border-b-2 border-blue-500 -mb-px" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            {v === "levels" ? "Security Levels" : "Users"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">

        {/* ── LEVELS VIEW ─────────────────────────────────────── */}
        {view === "levels" && (
          <div className="space-y-2">
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              Security levels control what each user can do at runtime. Assign a level when creating or editing a user.
            </div>
            {LEVELS.map(l => (
              <div key={l.role} className={`rounded-lg border ${l.border} ${l.bg} p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-full border ${l.border} flex items-center justify-center text-[11px] font-bold ${l.color}`}>
                    {l.level}
                  </div>
                  <span className={`text-sm font-semibold ${l.color}`}>{l.label}</span>
                  <span className="text-[10px] text-zinc-500 ml-auto">
                    {users.filter(u => u.role === l.role).length} user{users.filter(u => u.role === l.role).length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="space-y-0.5 ml-8">
                  {l.perms.map(p => (
                    <li key={p} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                      <span className={`${l.color} text-[9px] shrink-0`}>✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ── USERS VIEW ──────────────────────────────────────── */}
        {view === "users" && (
          <>
            {/* Add button / form */}
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                {users.length} user{users.length !== 1 ? "s" : ""}
              </div>
              <button onClick={() => { setShowAdd(v => !v); setSaveErr(""); }}
                className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">
                {showAdd ? "cancel" : "+ add user"}
              </button>
            </div>

            {showAdd && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">New User</div>
                <input value={newUser} onChange={e => setNewUser(e.target.value)}
                  placeholder="username" autoFocus className={inp} />
                <input value={newPass} onChange={e => setNewPass(e.target.value)}
                  placeholder="password" type="password" className={inp} />
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1.5">Security Level</div>
                  <LevelPicker value={newRole} onChange={setNewRole} />
                </div>
                <PermList role={newRole} />
                {saveErr && <div className="text-[10px] text-red-400">{saveErr}</div>}
                <button onClick={addUser}
                  disabled={saving || !newUser.trim() || !newPass.trim()}
                  className="w-full text-xs py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium">
                  {saving ? "Creating…" : "Create User"}
                </button>
              </div>
            )}

            {devMode && (
              <div className="text-[11px] text-zinc-500 italic bg-zinc-800/40 rounded-lg p-2.5 leading-relaxed">
                Security not configured. Start the runtime with{" "}
                <code className="font-mono text-zinc-400">--security-db security.db</code>{" "}
                to enable user management.
              </div>
            )}

            {error && !devMode && (
              <div className="text-[11px] text-red-400">{error}</div>
            )}

            {loading && <div className="text-[11px] text-zinc-600 italic">Loading…</div>}

            {/* User cards */}
            <div className="space-y-2">
              {users.map(u => {
                const l = levelOf(u.role);
                const isEditingRole = editRole === u.username;
                const isEditingPwd  = pwdUser  === u.username;
                return (
                  <div key={u.username}
                    className={`rounded-xl border transition-colors ${isEditingRole ? `${l.border} ${l.bg}` : "border-zinc-700/60 bg-zinc-800/40"}`}>
                    {/* User header */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      {/* Status dot */}
                      <div className={`w-2 h-2 rounded-full shrink-0 ${u.enabled ? "bg-emerald-500" : "bg-zinc-600"}`} />
                      {/* Name */}
                      <span className="text-xs font-semibold text-zinc-100 flex-1 truncate">{u.username}</span>
                      {/* Level badge */}
                      <button
                        onClick={() => { setEditRole(isEditingRole ? null : u.username); setPwdUser(null); }}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium transition-colors ${l.color} ${l.border} ${isEditingRole ? l.bg : "bg-transparent hover:opacity-80"}`}
                      >
                        <span className="text-[9px]">L{l.level}</span>
                        {l.label}
                        <span className="text-[9px] opacity-60">▾</span>
                      </button>
                    </div>

                    {/* Role editor */}
                    {isEditingRole && (
                      <div className="px-3 pb-3 space-y-2 border-t border-zinc-700/40 pt-2">
                        <div className="text-[10px] text-zinc-500">Change security level</div>
                        <LevelPicker value={u.role} onChange={r => setRole(u.username, r)} />
                      </div>
                    )}

                    {/* Password editor */}
                    {isEditingPwd && (
                      <div className="px-3 pb-3 space-y-1.5 border-t border-zinc-700/40 pt-2">
                        <div className="text-[10px] text-zinc-500">New password</div>
                        <div className="flex gap-1.5">
                          <input autoFocus value={pwdDraft} onChange={e => setPwdDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") changePassword(u.username); if (e.key === "Escape") setPwdUser(null); }}
                            type="password" placeholder="new password"
                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-blue-600 text-zinc-200"
                          />
                          <button onClick={() => changePassword(u.username)}
                            disabled={pwdSaving || !pwdDraft.trim()}
                            className="text-[10px] px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40">
                            {pwdSaving ? "…" : "Set"}
                          </button>
                        </div>
                        {pwdErr && <div className="text-[10px] text-red-400">{pwdErr}</div>}
                      </div>
                    )}

                    {/* Action strip */}
                    <div className="flex border-t border-zinc-700/30 divide-x divide-zinc-700/30">
                      <button onClick={() => toggleEnabled(u)}
                        className={`flex-1 py-1.5 text-[10px] transition-colors ${
                          u.enabled ? "text-zinc-500 hover:text-amber-400" : "text-zinc-500 hover:text-emerald-400"
                        }`}>
                        {u.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => { setPwdUser(isEditingPwd ? null : u.username); setPwdDraft(""); setPwdErr(""); setEditRole(null); }}
                        className={`flex-1 py-1.5 text-[10px] transition-colors ${isEditingPwd ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                        Password
                      </button>
                      <button onClick={() => deleteUser(u.username)}
                        className="flex-1 py-1.5 text-[10px] text-zinc-500 hover:text-red-400 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              {!loading && users.length === 0 && !error && (
                <div className="text-[11px] text-zinc-600 italic">No users yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
