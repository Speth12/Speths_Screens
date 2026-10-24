/** Renders a symbol SVG. Pass size=0 to fill container (100% × 100%). */
export function SymbolSVG({
  svg,
  stroke = "currentColor",
  size = 48,
}: {
  svg: string;
  stroke?: string;
  /** px size, or 0 to fill parent container */
  size?: number;
}) {
  const dim = size > 0 ? `width="${size}" height="${size}"` : `width="100%" height="100%"`;
  const style = size > 0
    ? { width: size, height: size, color: stroke, flexShrink: 0 as const }
    : { width: "100%", height: "100%", color: stroke };
  return (
    <div
      style={style}
      dangerouslySetInnerHTML={{
        __html: `<svg viewBox="0 0 64 64" ${dim} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible;display:block">${svg}</svg>`,
      }}
    />
  );
}
