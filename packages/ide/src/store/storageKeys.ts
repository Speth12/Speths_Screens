/**
 * Reads a value kept in localStorage under its current key, or else under the
 * key it had before the rename to Speth's Screens ("xhmi-..."). An old entry
 * is moved to the new key, so an autosaved project or a saved target is not
 * lost. Null when there is none, or when storage cannot be read (private
 * mode, blocked site data).
 */
export function readMigrated(current: string, previous: string): string | null {
  try {
    const now = localStorage.getItem(current);
    if (now !== null) return now;
    const old = localStorage.getItem(previous);
    if (old !== null) {
      localStorage.setItem(current, old);
      localStorage.removeItem(previous);
    }
    return old;
  } catch {
    return null;
  }
}
