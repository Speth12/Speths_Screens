// Login screen for security.mode "login". A user who must change their
// password (the first admin) does that here before getting in.
import { useState } from "react";
import { changePassword, login, setToken } from "./auth";

const MIN_PASSWORD = 8; // the runtime refuses shorter ones

export function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [changeToken, setChangeToken] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await login(username, password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.mustChangePassword) return setChangeToken(r.token);
    setToken(r.token);
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_PASSWORD) return setError(`The new password needs at least ${MIN_PASSWORD} characters`);
    if (next !== repeat) return setError("The two new passwords differ");
    setBusy(true);
    setError("");
    const err = await changePassword(changeToken!, password, next);
    if (err) {
      setBusy(false);
      return setError(err);
    }
    const r = await login(username, next);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setToken(r.token);
  };

  const input = "w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm";
  return (
    <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-200">
      <form onSubmit={changeToken ? submitChange : submitLogin} className="w-80 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="text-lg font-semibold">Speth's Screens</div>
        {changeToken ? (
          <>
            <div className="text-sm text-zinc-400">Choose a new password for {username} before you continue.</div>
            <input className={input} type="password" placeholder="New password" autoFocus
                   value={next} onChange={(e) => setNext(e.target.value)} />
            <input className={input} type="password" placeholder="New password again"
                   value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </>
        ) : (
          <>
            <input className={input} placeholder="Username" autoFocus autoComplete="username"
                   value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className={input} type="password" placeholder="Password" autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        {error && <div role="alert" className="text-sm text-red-400">{error}</div>}
        <button type="submit" disabled={busy}
                className="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 text-sm font-medium">
          {changeToken ? "Change password" : "Log in"}
        </button>
      </form>
    </div>
  );
}
