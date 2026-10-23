import { useState } from "react";
import { useProject, newWidgetId } from "../store/projectStore";
import { SYMBOLS, SYMBOL_PACKS, CATEGORIES, type SymbolCategory } from "../data/symbols";

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

export function SymbolLibrary() {
  const { addWidget, activePageId, project } = useProject();
  const [category, setCategory] = useState<SymbolCategory | "all">("all");
  const [filter, setFilter]     = useState("");

  // Default: all packs enabled if not set
  const enabledPacks = project.enabledSymbolPacks ?? SYMBOL_PACKS.map(p => p.id);

  const filtered = SYMBOLS.filter(s => {
    if (!enabledPacks.includes(s.packId)) return false;
    if (category !== "all" && s.category !== category) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.keywords.some(k => k.includes(q));
  });

  const add = (id: string) => {
    const sym = SYMBOLS.find(s => s.id === id);
    addWidget(activePageId, {
      id: newWidgetId(),
      type: "symbol",
      x: 0, y: 0, w: 3, h: 3,
      config: { symbolId: id, label: sym?.name ?? id, stroke: "#d4d4d8" },
    });
  };

  const totalEnabled = SYMBOLS.filter(s => enabledPacks.includes(s.packId)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Category strip */}
      <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto shrink-0 scrollbar-none">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-colors whitespace-nowrap ${
              category === c.id
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 pb-2 shrink-0">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="search symbols…"
          className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {/* Count */}
      <div className="px-2 pb-1 shrink-0 text-[10px] text-zinc-600">
        {totalEnabled} symbols · {SYMBOL_PACKS.filter(p => enabledPacks.includes(p.id)).length} packs enabled
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <div className="text-[11px] text-zinc-600 italic pt-2 px-1">
            {totalEnabled === 0 ? "No symbol packs enabled — enable packs in Project → Symbol Packs." : "No symbols match."}
          </div>
        ) : (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {filtered.map(sym => (
              <button
                key={sym.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData("text/x-symbol-id", sym.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => add(sym.id)}
                title={sym.name}
                className="flex flex-col items-center gap-1 p-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/80 border border-transparent hover:border-zinc-600 transition-colors cursor-grab active:cursor-grabbing text-zinc-300 hover:text-white"
              >
                <SymbolSVG svg={sym.svg} size={42} />
                <span className="text-[9px] text-zinc-400 text-center leading-tight line-clamp-2 w-full">
                  {sym.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
