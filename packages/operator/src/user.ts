/** Who a login token is for. The token is only read here to show a name; the runtime checks it. */
export function tokenUser(token: string | null): { name: string; role: string } | null {
  if (!token) return null;
  try {
    const body = token.split(".")[1];
    if (!body) return null;
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown; role?: unknown };
    return typeof json.sub === "string" ? { name: json.sub, role: typeof json.role === "string" ? json.role : "" } : null;
  } catch {
    return null;
  }
}
