import { useEffect, useMemo, useState } from "react";
import { dummyState } from "../store/dummyData";
import type { TagState } from "../store/tagStoreClient";

const empty: TagState = { value: null, quality: "Unknown", ts: 0 };

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** A made-up value for a path, changing every second; Unknown for no path. */
export function useDummyTag(path: string | undefined): TagState {
  const now = useNow(!!path);
  return path ? dummyState(path, now) : empty;
}

/** Made-up values for several paths. */
export function useDummyTags(paths: string[]): Record<string, TagState> {
  const now = useNow(paths.length > 0);
  const key = paths.join("\0");
  return useMemo(() => Object.fromEntries(paths.map((p) => [p, dummyState(p, now)])), [key, now]); // eslint-disable-line react-hooks/exhaustive-deps
}
