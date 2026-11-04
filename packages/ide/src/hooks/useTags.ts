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
    // A new set of paths starts from their own values, or Unknown: never old ones.
    setStates(Object.fromEntries(bindings.map((b) => [b, tagStoreClient.get(b) ?? empty])));
    const unsubs: Array<() => void> = [];
    bindings.forEach((b) => {
      unsubs.push(tagStoreClient.subscribe(b, (s) => setStates((prev) => ({ ...prev, [b]: s }))));
    });
    return () => unsubs.forEach((u) => u());
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return states;
}
