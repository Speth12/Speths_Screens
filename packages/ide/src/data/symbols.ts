export type SymbolCategory = "valves" | "pumps" | "vessels" | "instruments" | "electrical" | "piping";

export type SymbolPack = {
  id: string;
  name: string;
  description: string;
  category: SymbolCategory;
};

export type SymbolDef = {
  id: string;
  name: string;
  packId: string;
  category: SymbolCategory;
  keywords: string[];
  /** Inner SVG elements — no outer <svg> tag. Parent SVG sets fill="none" stroke="currentColor". */
  svg: string;
};

export const SYMBOL_PACKS: SymbolPack[] = [
  { id: "isa-valves",      name: "ISA Valves",           description: "Gate, globe, ball, check, butterfly, safety, needle, solenoid & more", category: "valves"      },
  { id: "isa-pumps",       name: "ISA Pumps & Rotating", description: "Centrifugal, PD, fan, compressor, turbine, vacuum & more",             category: "pumps"       },
  { id: "isa-vessels",     name: "ISA Vessels",          description: "Tanks, drums, separators, heat exchangers, columns & more",            category: "vessels"     },
  { id: "isa-instruments", name: "ISA Instruments",      description: "Indicators, transmitters, switches, controllers, analyzers",           category: "instruments" },
  { id: "isa-piping",      name: "ISA Piping",           description: "Reducers, tees, flanges, strainers, sight glass & more",              category: "piping"      },
  { id: "electrical",      name: "Electrical",           description: "Motors, generators, breakers, VFDs, contactors & more",               category: "electrical"  },
];

export const CATEGORIES: { id: SymbolCategory | "all"; label: string }[] = [
  { id: "all",         label: "All"         },
  { id: "valves",      label: "Valves"      },
  { id: "pumps",       label: "Pumps"       },
  { id: "vessels",     label: "Vessels"     },
  { id: "instruments", label: "Instruments" },
  { id: "piping",      label: "Piping"      },
  { id: "electrical",  label: "Electrical"  },
];

export const SYMBOLS: SymbolDef[] = [
  // ── ISA VALVES ────────────────────────────────────────────────────────────
  {
    id: "gate-valve",
    name: "Gate Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["gate", "valve", "isolation", "shutoff"],
    svg: `
      <polygon points="8,16 32,32 8,48" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>
      <polygon points="56,16 32,32 56,48" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>
      <line x1="32" y1="8" x2="32" y2="32"/>
      <line x1="22" y1="8" x2="42" y2="8"/>
    `,
  },
  {
    id: "globe-valve",
    name: "Globe / Control Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["globe", "control", "valve", "modulating", "cv"],
    svg: `
      <polygon points="8,20 32,36 8,52"/>
      <polygon points="56,20 32,36 56,52"/>
      <line x1="32" y1="16" x2="32" y2="36"/>
      <circle cx="32" cy="10" r="9"/>
    `,
  },
  {
    id: "ball-valve",
    name: "Ball Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["ball", "valve", "quarter-turn"],
    svg: `
      <line x1="4" y1="32" x2="16" y2="32"/>
      <line x1="48" y1="32" x2="60" y2="32"/>
      <circle cx="32" cy="32" r="16"/>
      <line x1="32" y1="16" x2="32" y2="6"/>
      <line x1="25" y1="6" x2="39" y2="6"/>
    `,
  },
  {
    id: "check-valve",
    name: "Check Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["check", "non-return", "one-way", "nrv"],
    svg: `
      <line x1="4" y1="32" x2="16" y2="32"/>
      <line x1="47" y1="32" x2="60" y2="32"/>
      <polygon points="16,14 47,32 16,50" fill="currentColor" stroke="currentColor"/>
      <line x1="47" y1="14" x2="47" y2="50"/>
    `,
  },
  {
    id: "butterfly-valve",
    name: "Butterfly Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["butterfly", "valve", "wafer"],
    svg: `
      <circle cx="32" cy="36" r="18"/>
      <path d="M20 50 L44 22"/>
      <line x1="32" y1="8" x2="32" y2="18"/>
      <line x1="25" y1="8" x2="39" y2="8"/>
    `,
  },
  {
    id: "safety-valve",
    name: "Safety Relief Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["safety", "relief", "psv", "prv", "pressure", "rupture"],
    svg: `
      <polyline points="8,52 32,16 56,52"/>
      <line x1="32" y1="16" x2="32" y2="8"/>
      <line x1="24" y1="8" x2="40" y2="8"/>
      <line x1="32" y1="52" x2="32" y2="56"/>
      <polyline points="26,56 38,58 26,60 38,62"/>
    `,
  },
  {
    id: "needle-valve",
    name: "Needle Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["needle", "valve", "fine", "metering"],
    svg: `
      <polygon points="8,20 32,36 8,52"/>
      <polygon points="56,20 32,36 56,52"/>
      <line x1="32" y1="4" x2="32" y2="36"/>
      <polygon points="28,4 36,4 32,16" fill="currentColor"/>
    `,
  },
  {
    id: "solenoid-valve",
    name: "Solenoid Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["solenoid", "valve", "on-off", "electric", "actuated"],
    svg: `
      <polygon points="8,20 32,36 8,52" fill="currentColor"/>
      <polygon points="56,20 32,36 56,52" fill="currentColor"/>
      <rect x="22" y="4" width="20" height="14" rx="2"/>
      <line x1="32" y1="18" x2="32" y2="36"/>
      <line x1="28" y1="7" x2="36" y2="7"/>
      <line x1="28" y1="11" x2="36" y2="11"/>
      <line x1="28" y1="15" x2="36" y2="15"/>
    `,
  },
  {
    id: "plug-valve",
    name: "Plug Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["plug", "valve", "cock", "quarter-turn"],
    svg: `
      <line x1="4" y1="32" x2="16" y2="32"/>
      <line x1="48" y1="32" x2="60" y2="32"/>
      <path d="M16 20 L48 20 L44 44 L20 44 Z"/>
      <line x1="32" y1="10" x2="32" y2="20"/>
      <line x1="25" y1="10" x2="39" y2="10"/>
    `,
  },
  {
    id: "diaphragm-valve",
    name: "Diaphragm Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["diaphragm", "valve", "sanitary", "hygienic"],
    svg: `
      <polygon points="8,20 32,36 8,52"/>
      <polygon points="56,20 32,36 56,52"/>
      <path d="M20 36 Q32 20 44 36" fill="none"/>
      <line x1="32" y1="8" x2="32" y2="20"/>
      <circle cx="32" cy="6" r="4"/>
    `,
  },
  {
    id: "3way-valve",
    name: "3-Way Valve",
    packId: "isa-valves",
    category: "valves",
    keywords: ["3-way", "three-way", "valve", "diverting", "mixing"],
    svg: `
      <line x1="4" y1="32" x2="22" y2="32"/>
      <line x1="42" y1="32" x2="60" y2="32"/>
      <line x1="32" y1="14" x2="32" y2="22"/>
      <polygon points="22,20 42,20 42,44 22,44" fill="none" stroke="currentColor"/>
      <circle cx="32" cy="32" r="6"/>
      <line x1="32" y1="6" x2="32" y2="14"/>
      <line x1="26" y1="6" x2="38" y2="6"/>
    `,
  },
  {
    id: "pressure-regulator",
    name: "Pressure Regulator",
    packId: "isa-valves",
    category: "valves",
    keywords: ["pressure", "regulator", "prv", "reducing", "back-pressure"],
    svg: `
      <polygon points="8,20 32,36 8,52"/>
      <polygon points="56,20 32,36 56,52"/>
      <line x1="32" y1="16" x2="32" y2="36"/>
      <circle cx="32" cy="10" r="8"/>
      <path d="M26 10 Q32 6 38 10" fill="none"/>
    `,
  },
  {
    id: "rupture-disk",
    name: "Rupture Disk",
    packId: "isa-valves",
    category: "valves",
    keywords: ["rupture", "disk", "burst", "relief", "pressure"],
    svg: `
      <line x1="4"  y1="32" x2="28" y2="32"/>
      <line x1="36" y1="32" x2="60" y2="32"/>
      <line x1="32" y1="16" x2="32" y2="48"/>
      <path d="M24 16 Q32 24 40 16" fill="none"/>
    `,
  },
  // ── ISA PUMPS / ROTATING ──────────────────────────────────────────────────
  {
    id: "centrifugal-pump",
    name: "Centrifugal Pump",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["centrifugal", "pump", "rotodynamic", "impeller"],
    svg: `
      <circle cx="32" cy="36" r="20"/>
      <line x1="4" y1="36" x2="12" y2="36"/>
      <line x1="32" y1="4" x2="32" y2="16"/>
      <path d="M 32 22 A 10 10 0 1 0 22 32" fill="none"/>
      <polyline points="20,28 22,32 26,30"/>
    `,
  },
  {
    id: "pd-pump",
    name: "Positive Displacement Pump",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["positive", "displacement", "pd", "piston", "gear", "pump"],
    svg: `
      <rect x="10" y="20" width="44" height="28" rx="2"/>
      <circle cx="26" cy="34" r="9"/>
      <circle cx="38" cy="34" r="9"/>
      <line x1="4" y1="34" x2="10" y2="34"/>
      <line x1="54" y1="34" x2="60" y2="34"/>
    `,
  },
  {
    id: "fan",
    name: "Fan / Blower",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["fan", "blower", "ventilation", "air"],
    svg: `
      <circle cx="32" cy="32" r="22"/>
      <path d="M32 10 Q44 20 32 32" fill="currentColor" stroke="none"/>
      <path d="M54 32 Q44 44 32 32" fill="currentColor" stroke="none"/>
      <path d="M32 54 Q20 44 32 32" fill="currentColor" stroke="none"/>
      <path d="M10 32 Q20 20 32 32" fill="currentColor" stroke="none"/>
    `,
  },
  {
    id: "compressor",
    name: "Compressor",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["compressor", "gas", "air", "compression", "screw"],
    svg: `
      <circle cx="32" cy="32" r="22"/>
      <path d="M32 10 A22 22 0 0 1 54 32 L32 32 Z" fill="currentColor" stroke="none"/>
      <line x1="4" y1="32" x2="10" y2="32"/>
      <line x1="54" y1="32" x2="60" y2="32"/>
    `,
  },
  {
    id: "vacuum-pump",
    name: "Vacuum Pump",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["vacuum", "pump", "suction", "liquid ring"],
    svg: `
      <circle cx="32" cy="36" r="20"/>
      <line x1="4" y1="36" x2="12" y2="36"/>
      <line x1="32" y1="4" x2="32" y2="16"/>
      <path d="M 32 22 A 10 10 0 1 1 22 32" fill="none"/>
      <polyline points="20,36 22,32 26,34"/>
      <line x1="26" y1="8" x2="38" y2="8"/>
      <line x1="32" y1="4" x2="32" y2="12"/>
    `,
  },
  {
    id: "turbine",
    name: "Turbine",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["turbine", "steam", "gas", "expander", "rotating"],
    svg: `
      <circle cx="32" cy="32" r="22"/>
      <path d="M32 10 Q26 18 32 32 Q38 18 32 10" fill="currentColor" stroke="none"/>
      <path d="M54 32 Q46 26 32 32 Q46 38 54 32" fill="currentColor" stroke="none"/>
      <path d="M32 54 Q38 46 32 32 Q26 46 32 54" fill="currentColor" stroke="none"/>
      <path d="M10 32 Q18 38 32 32 Q18 26 10 32" fill="currentColor" stroke="none"/>
      <circle cx="32" cy="32" r="5" fill="currentColor"/>
    `,
  },
  {
    id: "screw-pump",
    name: "Screw Pump",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["screw", "pump", "progressive", "cavity"],
    svg: `
      <rect x="10" y="22" width="44" height="20" rx="10"/>
      <path d="M18 22 Q22 32 18 42" fill="none" stroke-width="2.5"/>
      <path d="M26 22 Q30 32 26 42" fill="none" stroke-width="2.5"/>
      <path d="M34 22 Q38 32 34 42" fill="none" stroke-width="2.5"/>
      <path d="M42 22 Q46 32 42 42" fill="none" stroke-width="2.5"/>
      <line x1="4" y1="32" x2="10" y2="32"/>
      <line x1="54" y1="32" x2="60" y2="32"/>
    `,
  },
  {
    id: "ejector",
    name: "Ejector / Eductor",
    packId: "isa-pumps",
    category: "pumps",
    keywords: ["ejector", "eductor", "jet", "eduction", "venturi"],
    svg: `
      <path d="M4 24 L32 28 L60 20 L60 44 L32 36 L4 40 Z"/>
      <line x1="32" y1="4" x2="32" y2="28"/>
    `,
  },
  // ── ISA VESSELS ───────────────────────────────────────────────────────────
  {
    id: "vertical-vessel",
    name: "Vertical Vessel",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["vessel", "tank", "pressure", "column", "drum", "tower"],
    svg: `
      <path d="M18 52 L18 18 Q18 8 32 8 Q46 8 46 18 L46 52 Q46 62 32 62 Q18 62 18 52 Z"/>
    `,
  },
  {
    id: "horizontal-vessel",
    name: "Horizontal Vessel",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["horizontal", "vessel", "drum", "separator", "filter"],
    svg: `
      <path d="M14 20 L50 20 Q60 20 60 32 Q60 44 50 44 L14 44 Q4 44 4 32 Q4 20 14 20 Z"/>
    `,
  },
  {
    id: "open-tank",
    name: "Open Tank",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["tank", "open", "sump", "pit", "reservoir"],
    svg: `
      <polyline points="8,8 8,60 56,60 56,8"/>
      <line x1="18" y1="38" x2="46" y2="38"/>
      <path d="M8 38 Q17 34 26 38 Q35 42 44 38 Q53 34 56 36" fill="none"/>
    `,
  },
  {
    id: "heat-exchanger",
    name: "Shell & Tube HX",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["heat", "exchanger", "shell", "tube", "hx", "cooler", "heater"],
    svg: `
      <rect x="12" y="18" width="40" height="28"/>
      <line x1="22" y1="18" x2="22" y2="46"/>
      <line x1="42" y1="18" x2="42" y2="46"/>
      <line x1="4"  y1="26" x2="12" y2="26"/>
      <line x1="52" y1="26" x2="60" y2="26"/>
      <line x1="4"  y1="38" x2="12" y2="38"/>
      <line x1="52" y1="38" x2="60" y2="38"/>
    `,
  },
  {
    id: "agitator",
    name: "Agitator / Reactor",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["agitator", "mixer", "stirrer", "reactor", "vessel"],
    svg: `
      <rect x="16" y="10" width="32" height="50" rx="4"/>
      <line x1="32" y1="4"  x2="32" y2="26"/>
      <line x1="20" y1="26" x2="44" y2="26"/>
      <line x1="20" y1="30" x2="24" y2="26"/>
      <line x1="44" y1="30" x2="40" y2="26"/>
      <line x1="32" y1="26" x2="32" y2="42"/>
      <line x1="20" y1="42" x2="44" y2="42"/>
      <line x1="20" y1="46" x2="24" y2="42"/>
      <line x1="44" y1="46" x2="40" y2="42"/>
    `,
  },
  {
    id: "column-tower",
    name: "Column / Tower",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["column", "tower", "distillation", "absorption", "packed"],
    svg: `
      <path d="M20 56 L20 16 Q20 8 32 8 Q44 8 44 16 L44 56 Q44 62 32 62 Q20 62 20 56 Z"/>
      <line x1="20" y1="26" x2="44" y2="26"/>
      <line x1="20" y1="36" x2="44" y2="36"/>
      <line x1="20" y1="46" x2="44" y2="46"/>
      <path d="M22 26 Q32 30 42 26" fill="none"/>
      <path d="M22 36 Q32 40 42 36" fill="none"/>
      <path d="M22 46 Q32 50 42 46" fill="none"/>
    `,
  },
  {
    id: "separator",
    name: "3-Phase Separator",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["separator", "3-phase", "knock-out", "drum", "flash"],
    svg: `
      <path d="M14 20 L50 20 Q60 20 60 32 Q60 44 50 44 L14 44 Q4 44 4 32 Q4 20 14 20 Z"/>
      <line x1="24" y1="20" x2="24" y2="44"/>
      <line x1="40" y1="20" x2="40" y2="44"/>
      <line x1="32" y1="4"  x2="32" y2="20"/>
      <line x1="32" y1="44" x2="32" y2="60"/>
      <line x1="16" y1="60" x2="48" y2="60"/>
    `,
  },
  {
    id: "filter-vessel",
    name: "Filter / Strainer",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["filter", "strainer", "bag", "cartridge", "y-strainer"],
    svg: `
      <path d="M14 20 L50 20 Q60 20 60 32 Q60 44 50 44 L14 44 Q4 44 4 32 Q4 20 14 20 Z"/>
      <line x1="20" y1="24" x2="44" y2="40"/>
      <line x1="24" y1="24" x2="48" y2="40"/>
      <line x1="28" y1="22" x2="52" y2="38"/>
      <line x1="16" y1="26" x2="40" y2="42"/>
    `,
  },
  {
    id: "cooling-tower",
    name: "Cooling Tower",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["cooling", "tower", "ct", "heat", "rejection"],
    svg: `
      <path d="M8 60 L16 12 Q32 4 48 12 L56 60 Z"/>
      <path d="M16 40 Q32 36 48 40"/>
      <path d="M12 52 Q32 48 52 52"/>
      <line x1="32" y1="4"  x2="32" y2="12"/>
    `,
  },
  {
    id: "furnace",
    name: "Furnace / Fired Heater",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["furnace", "fired", "heater", "boiler", "burner"],
    svg: `
      <rect x="8" y="16" width="48" height="44" rx="4"/>
      <path d="M20 42 Q26 30 32 36 Q38 30 44 42" fill="none"/>
      <path d="M16 52 Q22 40 28 46 Q34 40 40 46 Q46 40 48 52" fill="none"/>
      <line x1="24" y1="8" x2="24" y2="16"/>
      <line x1="40" y1="8" x2="40" y2="16"/>
    `,
  },
  {
    id: "air-fin-cooler",
    name: "Air Fin Cooler",
    packId: "isa-vessels",
    category: "vessels",
    keywords: ["air", "fin", "cooler", "afc", "forced", "draft"],
    svg: `
      <rect x="8" y="24" width="48" height="16"/>
      <circle cx="20" cy="50" r="10"/>
      <circle cx="44" cy="50" r="10"/>
      <path d="M20 40 Q20 44 20 50" fill="none"/>
      <path d="M44 40 Q44 44 44 50" fill="none"/>
      <path d="M14 48 L26 52"/>
      <path d="M14 52 L26 48"/>
      <path d="M38 48 L50 52"/>
      <path d="M38 52 L50 48"/>
      <line x1="4"  y1="28" x2="8"  y2="28"/>
      <line x1="56" y1="28" x2="60" y2="28"/>
      <line x1="4"  y1="36" x2="8"  y2="36"/>
      <line x1="56" y1="36" x2="60" y2="36"/>
    `,
  },
  // ── ISA INSTRUMENTS ───────────────────────────────────────────────────────
  {
    id: "pi",
    name: "Pressure Indicator",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["pressure", "indicator", "pi", "gauge", "psi", "bar"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">PI</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
    `,
  },
  {
    id: "ti",
    name: "Temperature Indicator",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["temperature", "indicator", "ti", "thermocouple", "rtd", "celsius"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">TI</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
    `,
  },
  {
    id: "fi",
    name: "Flow Indicator",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["flow", "indicator", "fi", "flowmeter", "orifice"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">FI</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
    `,
  },
  {
    id: "li",
    name: "Level Indicator",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["level", "indicator", "li", "radar", "ultrasonic"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">LI</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
    `,
  },
  {
    id: "ai",
    name: "Analyzer Indicator",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["analyzer", "analysis", "ai", "quality", "composition", "ph", "conductivity"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">AI</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
    `,
  },
  {
    id: "transmitter",
    name: "Transmitter",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["transmitter", "sensor", "measurement", "4-20ma", "hart"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">Tx</text>
      <line x1="32" y1="4" x2="32" y2="18" stroke-dasharray="3,2"/>
    `,
  },
  {
    id: "pt",
    name: "Pressure Transmitter",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["pressure", "transmitter", "pt", "4-20ma", "hart"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">PT</text>
      <line x1="32" y1="4" x2="32" y2="18" stroke-dasharray="3,2"/>
    `,
  },
  {
    id: "tt",
    name: "Temperature Transmitter",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["temperature", "transmitter", "tt", "thermocouple", "rtd"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">TT</text>
      <line x1="32" y1="4" x2="32" y2="18" stroke-dasharray="3,2"/>
    `,
  },
  {
    id: "ft",
    name: "Flow Transmitter",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["flow", "transmitter", "ft", "flowmeter", "coriolis", "magnetic"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">FT</text>
      <line x1="32" y1="4" x2="32" y2="18" stroke-dasharray="3,2"/>
    `,
  },
  {
    id: "lt",
    name: "Level Transmitter",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["level", "transmitter", "lt", "radar", "guided-wave"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">LT</text>
      <line x1="32" y1="4" x2="32" y2="18" stroke-dasharray="3,2"/>
    `,
  },
  {
    id: "ps",
    name: "Pressure Switch",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["pressure", "switch", "ps", "hi", "lo", "trip"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">PS</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
      <line x1="24" y1="4" x2="40" y2="4"/>
    `,
  },
  {
    id: "ts",
    name: "Temperature Switch",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["temperature", "switch", "ts", "thermostat", "trip"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">TS</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
      <line x1="24" y1="4" x2="40" y2="4"/>
    `,
  },
  {
    id: "ls",
    name: "Level Switch",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["level", "switch", "ls", "float", "vibration", "trip"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="13" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">LS</text>
      <line x1="32" y1="4" x2="32" y2="18"/>
      <line x1="24" y1="4" x2="40" y2="4"/>
    `,
  },
  {
    id: "controller",
    name: "Controller",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["controller", "pid", "control", "ic", "fc", "tc", "lc", "pc"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <text x="32" y="44" text-anchor="middle" font-size="12" font-weight="bold" font-family="monospace" fill="currentColor" stroke="none">PIC</text>
      <line x1="32" y1="4" x2="32" y2="18" stroke-dasharray="3,2"/>
    `,
  },
  {
    id: "recorder",
    name: "Recorder",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["recorder", "chart", "historian", "trend", "datalogger"],
    svg: `
      <circle cx="32" cy="38" r="20"/>
      <path d="M20 44 Q24 36 28 40 Q32 44 36 36 Q40 28 44 32" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="32" y1="4" x2="32" y2="18"/>
    `,
  },
  {
    id: "orifice-plate",
    name: "Orifice Plate",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["orifice", "plate", "flow", "dp", "differential", "restriction"],
    svg: `
      <line x1="4"  y1="32" x2="28" y2="32"/>
      <line x1="36" y1="32" x2="60" y2="32"/>
      <line x1="32" y1="14" x2="32" y2="50"/>
      <line x1="28" y1="14" x2="36" y2="14"/>
      <line x1="28" y1="50" x2="36" y2="50"/>
    `,
  },
  {
    id: "control-valve-positioner",
    name: "Control Valve + Positioner",
    packId: "isa-instruments",
    category: "instruments",
    keywords: ["control", "valve", "positioner", "actuator", "pneumatic"],
    svg: `
      <polygon points="8,28 32,40 8,52"/>
      <polygon points="56,28 32,40 56,52"/>
      <rect x="20" y="10" width="24" height="14" rx="2"/>
      <line x1="32" y1="24" x2="32" y2="40"/>
      <circle cx="32" cy="17" r="5"/>
    `,
  },
  // ── ISA PIPING ────────────────────────────────────────────────────────────
  {
    id: "pipe-reducer",
    name: "Reducer",
    packId: "isa-piping",
    category: "piping",
    keywords: ["reducer", "concentric", "eccentric", "pipe", "fitting"],
    svg: `
      <path d="M4 24 L28 28 L28 36 L4 40 Z"/>
      <path d="M36 28 L60 24 L60 40 L36 36 Z"/>
      <line x1="28" y1="28" x2="36" y2="28"/>
      <line x1="28" y1="36" x2="36" y2="36"/>
    `,
  },
  {
    id: "pipe-tee",
    name: "Tee",
    packId: "isa-piping",
    category: "piping",
    keywords: ["tee", "junction", "branch", "pipe", "fitting"],
    svg: `
      <line x1="4"  y1="32" x2="60" y2="32"/>
      <line x1="32" y1="32" x2="32" y2="60"/>
      <line x1="20" y1="32" x2="20" y2="36"/>
      <line x1="44" y1="32" x2="44" y2="36"/>
    `,
  },
  {
    id: "pipe-flange",
    name: "Flange / Blind",
    packId: "isa-piping",
    category: "piping",
    keywords: ["flange", "blind", "pipe", "connection", "weld-neck"],
    svg: `
      <line x1="4"  y1="32" x2="26" y2="32"/>
      <line x1="38" y1="32" x2="60" y2="32"/>
      <line x1="26" y1="18" x2="26" y2="46"/>
      <line x1="38" y1="18" x2="38" y2="46"/>
      <line x1="20" y1="18" x2="20" y2="46"/>
      <line x1="44" y1="18" x2="44" y2="46"/>
    `,
  },
  {
    id: "y-strainer",
    name: "Y-Strainer",
    packId: "isa-piping",
    category: "piping",
    keywords: ["strainer", "y-strainer", "basket", "filter", "mesh"],
    svg: `
      <line x1="4"  y1="32" x2="60" y2="32"/>
      <line x1="32" y1="32" x2="44" y2="52"/>
      <line x1="44" y1="52" x2="44" y2="58"/>
      <circle cx="44" cy="58" r="4"/>
      <path d="M20 28 L32 32 L20 36" fill="none"/>
    `,
  },
  {
    id: "sight-glass",
    name: "Sight Glass",
    packId: "isa-piping",
    category: "piping",
    keywords: ["sight", "glass", "visual", "window", "flow", "indicator"],
    svg: `
      <line x1="4"  y1="32" x2="18" y2="32"/>
      <line x1="46" y1="32" x2="60" y2="32"/>
      <rect x="18" y="20" width="28" height="24" rx="4"/>
      <circle cx="32" cy="32" r="8"/>
    `,
  },
  {
    id: "flame-arrestor",
    name: "Flame Arrestor",
    packId: "isa-piping",
    category: "piping",
    keywords: ["flame", "arrestor", "detonation", "deflagration", "vent"],
    svg: `
      <line x1="4"  y1="32" x2="18" y2="32"/>
      <line x1="46" y1="32" x2="60" y2="32"/>
      <rect x="18" y="20" width="28" height="24"/>
      <line x1="22" y1="20" x2="22" y2="44"/>
      <line x1="26" y1="20" x2="26" y2="44"/>
      <line x1="30" y1="20" x2="30" y2="44"/>
      <line x1="34" y1="20" x2="34" y2="44"/>
      <line x1="38" y1="20" x2="38" y2="44"/>
      <line x1="42" y1="20" x2="42" y2="44"/>
    `,
  },
  {
    id: "flexible-hose",
    name: "Flexible Hose",
    packId: "isa-piping",
    category: "piping",
    keywords: ["flexible", "hose", "expansion", "joint", "bellows"],
    svg: `
      <line x1="4"  y1="32" x2="14" y2="32"/>
      <line x1="50" y1="32" x2="60" y2="32"/>
      <path d="M14 26 Q20 20 26 26 Q32 32 38 26 Q44 20 50 26"/>
      <path d="M14 38 Q20 44 26 38 Q32 32 38 38 Q44 44 50 38"/>
    `,
  },
  {
    id: "steam-trap",
    name: "Steam Trap",
    packId: "isa-piping",
    category: "piping",
    keywords: ["steam", "trap", "condensate", "thermostatic", "inverted"],
    svg: `
      <line x1="4"  y1="32" x2="18" y2="32"/>
      <line x1="46" y1="32" x2="60" y2="32"/>
      <circle cx="32" cy="32" r="14"/>
      <path d="M22 40 Q32 26 42 40" fill="none"/>
    `,
  },
  {
    id: "silencer",
    name: "Silencer / Muffler",
    packId: "isa-piping",
    category: "piping",
    keywords: ["silencer", "muffler", "vent", "noise", "atmospheric"],
    svg: `
      <line x1="4"  y1="32" x2="14" y2="32"/>
      <line x1="50" y1="32" x2="60" y2="32"/>
      <rect x="14" y="20" width="36" height="24" rx="6"/>
      <line x1="24" y1="20" x2="24" y2="44"/>
      <line x1="32" y1="20" x2="32" y2="44"/>
      <line x1="40" y1="20" x2="40" y2="44"/>
    `,
  },
  {
    id: "expansion-loop",
    name: "Expansion Loop",
    packId: "isa-piping",
    category: "piping",
    keywords: ["expansion", "loop", "flexibility", "thermal", "bellows"],
    svg: `
      <line x1="4"  y1="40" x2="16" y2="40"/>
      <line x1="48" y1="40" x2="60" y2="40"/>
      <path d="M16 40 L16 20 Q16 12 24 12 L40 12 Q48 12 48 20 L48 40" fill="none"/>
    `,
  },
  // ── ELECTRICAL ────────────────────────────────────────────────────────────
  {
    id: "motor",
    name: "Motor",
    packId: "electrical",
    category: "electrical",
    keywords: ["motor", "electric", "drive", "vfd", "induction"],
    svg: `
      <circle cx="32" cy="32" r="24"/>
      <text x="32" y="39" text-anchor="middle" font-size="22" font-weight="bold" font-family="sans-serif" fill="currentColor" stroke="none">M</text>
    `,
  },
  {
    id: "generator",
    name: "Generator",
    packId: "electrical",
    category: "electrical",
    keywords: ["generator", "alternator", "power", "genset"],
    svg: `
      <circle cx="32" cy="32" r="24"/>
      <text x="32" y="39" text-anchor="middle" font-size="22" font-weight="bold" font-family="sans-serif" fill="currentColor" stroke="none">G</text>
    `,
  },
  {
    id: "transformer",
    name: "Transformer",
    packId: "electrical",
    category: "electrical",
    keywords: ["transformer", "power", "step-up", "step-down", "electrical"],
    svg: `
      <circle cx="22" cy="32" r="14"/>
      <circle cx="42" cy="32" r="14"/>
      <line x1="4"  y1="32" x2="8"  y2="32"/>
      <line x1="56" y1="32" x2="60" y2="32"/>
    `,
  },
  {
    id: "circuit-breaker",
    name: "Circuit Breaker",
    packId: "electrical",
    category: "electrical",
    keywords: ["circuit", "breaker", "protection", "overcurrent", "mcb", "mccb"],
    svg: `
      <line x1="4"  y1="32" x2="20" y2="32"/>
      <line x1="44" y1="32" x2="60" y2="32"/>
      <line x1="20" y1="32" x2="44" y2="20"/>
      <line x1="32" y1="16" x2="32" y2="22"/>
      <circle cx="32" cy="14" r="4"/>
    `,
  },
  {
    id: "contactor",
    name: "Contactor",
    packId: "electrical",
    category: "electrical",
    keywords: ["contactor", "relay", "starter", "switching", "motor"],
    svg: `
      <line x1="4"  y1="32" x2="20" y2="32"/>
      <line x1="44" y1="32" x2="60" y2="32"/>
      <line x1="20" y1="32" x2="44" y2="20"/>
      <line x1="32" y1="8"  x2="32" y2="20"/>
      <line x1="26" y1="8"  x2="38" y2="8"/>
      <rect x="26" y="8" width="12" height="8" fill="currentColor"/>
    `,
  },
  {
    id: "vfd",
    name: "VFD / Inverter",
    packId: "electrical",
    category: "electrical",
    keywords: ["vfd", "inverter", "variable", "frequency", "drive", "speed"],
    svg: `
      <rect x="8" y="12" width="48" height="40" rx="4"/>
      <text x="32" y="31" text-anchor="middle" font-size="10" font-family="monospace" fill="currentColor" stroke="none">VFD</text>
      <path d="M16 40 Q20 34 24 38 Q28 42 32 36 Q36 30 40 34 Q44 38 48 32" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="20" y1="4"  x2="20" y2="12"/>
      <line x1="32" y1="4"  x2="32" y2="12"/>
      <line x1="44" y1="4"  x2="44" y2="12"/>
    `,
  },
  {
    id: "soft-starter",
    name: "Soft Starter",
    packId: "electrical",
    category: "electrical",
    keywords: ["soft", "starter", "motor", "ramp", "reduced-voltage"],
    svg: `
      <rect x="8" y="14" width="48" height="36" rx="4"/>
      <text x="32" y="28" text-anchor="middle" font-size="9" font-family="monospace" fill="currentColor" stroke="none">SOFT</text>
      <text x="32" y="42" text-anchor="middle" font-size="9" font-family="monospace" fill="currentColor" stroke="none">START</text>
      <line x1="20" y1="4" x2="20" y2="14"/>
      <line x1="44" y1="4" x2="44" y2="14"/>
    `,
  },
  {
    id: "fuse",
    name: "Fuse",
    packId: "electrical",
    category: "electrical",
    keywords: ["fuse", "overcurrent", "protection", "cartridge"],
    svg: `
      <line x1="4"  y1="32" x2="16" y2="32"/>
      <line x1="48" y1="32" x2="60" y2="32"/>
      <rect x="16" y="24" width="32" height="16" rx="4"/>
      <line x1="16" y1="32" x2="48" y2="32"/>
    `,
  },
  {
    id: "disconnect",
    name: "Disconnect Switch",
    packId: "electrical",
    category: "electrical",
    keywords: ["disconnect", "isolator", "switch", "knife", "safety"],
    svg: `
      <line x1="4"  y1="32" x2="20" y2="32"/>
      <line x1="44" y1="28" x2="60" y2="28"/>
      <circle cx="20" cy="32" r="3" fill="currentColor"/>
      <circle cx="44" cy="28" r="3" fill="currentColor"/>
      <line x1="20" y1="32" x2="44" y2="18"/>
    `,
  },
  {
    id: "plc-box",
    name: "PLC / Controller",
    packId: "electrical",
    category: "electrical",
    keywords: ["plc", "controller", "cpu", "processor", "control", "logic"],
    svg: `
      <rect x="10" y="10" width="44" height="44" rx="4"/>
      <text x="32" y="30" text-anchor="middle" font-size="10" font-family="monospace" fill="currentColor" stroke="none">PLC</text>
      <line x1="16" y1="54" x2="16" y2="60"/>
      <line x1="24" y1="54" x2="24" y2="60"/>
      <line x1="32" y1="54" x2="32" y2="60"/>
      <line x1="40" y1="54" x2="40" y2="60"/>
      <line x1="48" y1="54" x2="48" y2="60"/>
      <line x1="16" y1="10" x2="16" y2="4"/>
      <line x1="24" y1="10" x2="24" y2="4"/>
      <line x1="32" y1="10" x2="32" y2="4"/>
      <line x1="40" y1="10" x2="40" y2="4"/>
      <line x1="48" y1="10" x2="48" y2="4"/>
    `,
  },
  {
    id: "junction-box",
    name: "Junction Box",
    packId: "electrical",
    category: "electrical",
    keywords: ["junction", "box", "terminal", "panel", "enclosure", "marshalling"],
    svg: `
      <rect x="12" y="16" width="40" height="32" rx="3"/>
      <line x1="18" y1="16" x2="18" y2="48"/>
      <line x1="24" y1="16" x2="24" y2="48"/>
      <line x1="30" y1="16" x2="30" y2="48"/>
      <line x1="36" y1="16" x2="36" y2="48"/>
      <line x1="42" y1="16" x2="42" y2="48"/>
      <line x1="18" y1="8" x2="18" y2="16"/>
      <line x1="24" y1="8" x2="24" y2="16"/>
      <line x1="30" y1="8" x2="30" y2="16"/>
      <line x1="36" y1="8" x2="36" y2="16"/>
      <line x1="42" y1="8" x2="42" y2="16"/>
    `,
  },
];
