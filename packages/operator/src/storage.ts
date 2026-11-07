/**
 * Reads a value kept in localStorage. Null when there is none, or when storage
 * cannot be read (private mode, blocked site data).
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
