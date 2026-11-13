// Format 6 to 7 (internal/project/upgrade_v7.go does the same).
type Obj = Record<string, unknown>;

/** Drops the project's operator PIN. It was compared in the operator's browser, so it never
 *  protected anything; logins (security mode login) and the view and operate roles on pages and
 *  widgets replace it. */
export function v6ToV7(doc: Obj, note: (text: string) => void): void {
  if ("pin" in doc) {
    delete doc.pin;
    note("dropped the operator PIN: it was checked only in the browser; use logins (security mode login) and roles on pages and widgets instead");
  }
}
