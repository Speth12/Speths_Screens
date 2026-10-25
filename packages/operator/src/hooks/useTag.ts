import { useEffect, useState } from "react";
import { tagStoreClient, type TagState } from "../store/tagStoreClient";

const empty: TagState = { value: null, quality: "Unknown", ts: 0 };

/**
 * Subscribe to a tag's live value. Returns the cached value immediately
 * on mount, then updates on every WebSocket push. Pass an empty path
 * to no-op (useful for unbound widgets).
 */
export function useTag(path: string | undefined): TagState {
  const [state, setState] = useState<TagState>(() => {
    if (!path) return empty;
    return tagStoreClient.get(path) ?? empty;
  });

  useEffect(() => {
    if (!path) {
      setState(empty);
      return;
    }
    // A new path starts from its own value, or Unknown: never the old path's.
    setState(tagStoreClient.get(path) ?? empty);
    return tagStoreClient.subscribe(path, setState);
  }, [path]);

  return state;
}
