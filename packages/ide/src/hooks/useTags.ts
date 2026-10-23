import { useEffect, useState } from "react";
import { tagStoreClient, type TagState } from "../store/tagStoreClient";

const empty: TagState = { value: null, quality: "Unknown", ts: 0 };

/** Subscribe to multiple tag bindings simultaneously. Returns a map binding → TagState. */
export function useTags(bindings: string[]): Record<string, TagState> {
  const key = bindings.slice().sort().join("\0");

  const [states, setStates] = useState<Record<string, TagState>>(() => {
    const init: Record<string, TagState> = {};
    bindings.forEach((b) => { init[b] = tagStoreClient.get(b) ?? empty; });
    return init;
  });

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    bindings.forEach((b) => {
      const cached = tagStoreClient.get(b);
      if (cached) setStates((prev) => ({ ...prev, [b]: cached }));
      unsubs.push(tagStoreClient.subscribe(b, (s) => setStates((prev) => ({ ...prev, [b]: s }))));
    });
    return () => unsubs.forEach((u) => u());
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return states;
}
