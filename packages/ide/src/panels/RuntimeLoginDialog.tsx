// Logging in to a runtime that needs it (security mode "login"), so a deploy or a pull can go through.
import { useState } from "react";
import { setToken } from "../store/runtimeAuth";
import { Button, Dialog, Field, Input } from "../ui";

/** targetUrl is the address base the login goes to ("" is the program that served the editor); label names it. */
export function RuntimeLoginDialog({ targetUrl, label, onClose, onSuccess }: { targetUrl: string; label?: string; onClose: () => void; onSuccess: () => void }) {
  const where = label ?? (targetUrl || "this computer");
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${targetUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = (await r.json()) as { token?: string; error?: string; mustChangePassword?: boolean };
      if (!r.ok || !data.token) { setErr(data.error ?? "Login failed"); return; }
      if (data.mustChangePassword) {
        // The token only allows a password change; the operator screen does that.
        setErr(`${user} must choose a new password first: open ${label ?? (targetUrl || "the runtime")} in a browser and log in there.`);
        return;
      }
      setToken(targetUrl, data.token);
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="Runtime login" size="sm" onClose={onClose}
      footer={<Button submit form="runtime-login" variant="primary" disabled={busy || !user || !pass}>{busy ? "Logging in…" : "Login & deploy"}</Button>}>
      <form id="runtime-login" onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="font-mono text-ui-label text-zinc-400 truncate">{where}</div>
        <Field label="User name"><Input value={user} onChange={(e) => setUser(e.target.value)} autoFocus /></Field>
        <Field label="Password" error={err || undefined}><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
      </form>
    </Dialog>
  );
}
