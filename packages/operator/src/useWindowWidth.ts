import { useEffect, useState } from "react";

/** The browser window's width, kept up to date; it decides which screen size (desktop, tablet, phone) is drawn. */
export function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
