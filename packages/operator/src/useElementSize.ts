import { useEffect, useState } from "react";
import type { Size } from "@speths-screens/widgets";

/**
 * The content size of an element, kept up to date. Use the returned function
 * as the element's `ref`: the element may not exist on the first render (the
 * operator shows "loading" until the project arrives), and a ref object read
 * once in an effect with no dependencies would never see it. Zero until measured.
 */
export function useElementSize(): [(el: HTMLElement | null) => void, Size] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);
  return [setEl, size];
}
