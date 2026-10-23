export interface HMITheme {
  id: string;
  name: string;
  tagline: string;
  fontMono: string;
  radius: string;
  dangerColor: string;
  warningColor: string;
  successColor: string;
  cardStyle: "flat" | "glass" | "elevated" | "ruled";
  backgroundPattern: "none" | "grid" | "dots" | "crosshatch";
  useGlow: boolean;
  density: "compact" | "normal";
  headerGradient?: string;
  vars: {
    "--background": string;
    "--foreground": string;
    "--card": string;
    "--card-foreground": string;
    "--primary": string;
    "--primary-foreground": string;
    "--secondary": string;
    "--secondary-foreground": string;
    "--muted": string;
    "--muted-foreground": string;
    "--border": string;
  };
}

export const themes: HMITheme[] = [
  {
    id: "scada-dark",
    name: "SCADA Industrial",
    tagline: "Classic operator console",
    fontMono: "'JetBrains Mono', monospace",
    radius: "3px",
    dangerColor: "#ff3b30",
    warningColor: "#ff9500",
    successColor: "#30d158",
    cardStyle: "flat",
    backgroundPattern: "none",
    useGlow: false,
    density: "normal",
    vars: {
      "--background": "#0c0e10",
      "--foreground": "#dde2e6",
      "--card": "#141719",
      "--card-foreground": "#dde2e6",
      "--primary": "#f0a500",
      "--primary-foreground": "#0c0e10",
      "--secondary": "#1e2124",
      "--secondary-foreground": "#9ba3ac",
      "--muted": "#1a1d20",
      "--muted-foreground": "#6b7480",
      "--border": "#2a2f35",
    },
  },
  {
    id: "blueprint",
    name: "Aerospace Blueprint",
    tagline: "Defense & avionics grade",
    fontMono: "'JetBrains Mono', monospace",
    radius: "2px",
    dangerColor: "#ff453a",
    warningColor: "#ffd60a",
    successColor: "#32d74b",
    cardStyle: "flat",
    backgroundPattern: "grid",
    useGlow: false,
    density: "normal",
    vars: {
      "--background": "#040c1e",
      "--foreground": "#a8c8f0",
      "--card": "#071428",
      "--card-foreground": "#a8c8f0",
      "--primary": "#00b4d8",
      "--primary-foreground": "#040c1e",
      "--secondary": "#0a1f3d",
      "--secondary-foreground": "#6e9dc8",
      "--muted": "#081428",
      "--muted-foreground": "#4a78a8",
      "--border": "#0e2444",
    },
  },
  {
    id: "clean-room",
    name: "Clean Room / Medical",
    tagline: "Clinical precision",
    fontMono: "'JetBrains Mono', monospace",
    radius: "4px",
    dangerColor: "#d70015",
    warningColor: "#c17d00",
    successColor: "#007a3a",
    cardStyle: "elevated",
    backgroundPattern: "none",
    useGlow: false,
    density: "normal",
    vars: {
      "--background": "#f0f4f8",
      "--foreground": "#0f1923",
      "--card": "#ffffff",
      "--card-foreground": "#0f1923",
      "--primary": "#0052cc",
      "--primary-foreground": "#ffffff",
      "--secondary": "#e8eff7",
      "--secondary-foreground": "#1a3a5c",
      "--muted": "#e2eaf4",
      "--muted-foreground": "#4a6080",
      "--border": "#c8d8e8",
    },
  },
  {
    id: "brutalist",
    name: "Brutalist Terminal",
    tagline: "Raw operator authority",
    fontMono: "'JetBrains Mono', monospace",
    radius: "0px",
    dangerColor: "#ff0000",
    warningColor: "#ffff00",
    successColor: "#00ff00",
    cardStyle: "ruled",
    backgroundPattern: "none",
    useGlow: false,
    density: "compact",
    vars: {
      "--background": "#000000",
      "--foreground": "#ffffff",
      "--card": "#000000",
      "--card-foreground": "#ffffff",
      "--primary": "#ffffff",
      "--primary-foreground": "#000000",
      "--secondary": "#111111",
      "--secondary-foreground": "#cccccc",
      "--muted": "#0a0a0a",
      "--muted-foreground": "#888888",
      "--border": "#333333",
    },
  },
  {
    id: "holographic",
    name: "Holographic Glass",
    tagline: "Immersive ops center",
    fontMono: "'JetBrains Mono', monospace",
    radius: "12px",
    dangerColor: "#ff375f",
    warningColor: "#ff9f0a",
    successColor: "#30d158",
    cardStyle: "glass",
    backgroundPattern: "dots",
    useGlow: true,
    density: "normal",
    headerGradient: "linear-gradient(135deg, #1a0533 0%, #0a1a3a 50%, #001a2e 100%)",
    vars: {
      "--background": "#0d0820",
      "--foreground": "#e0e8ff",
      "--card": "rgba(255,255,255,0.06)",
      "--card-foreground": "#e0e8ff",
      "--primary": "#7c6bff",
      "--primary-foreground": "#ffffff",
      "--secondary": "rgba(255,255,255,0.04)",
      "--secondary-foreground": "#a0b0e0",
      "--muted": "rgba(255,255,255,0.03)",
      "--muted-foreground": "#6070a0",
      "--border": "rgba(120,140,255,0.18)",
    },
  },
  {
    id: "engineering-paper",
    name: "Engineering Paper",
    tagline: "Analog precision on digital",
    fontMono: "'JetBrains Mono', monospace",
    radius: "2px",
    dangerColor: "#b91c1c",
    warningColor: "#92400e",
    successColor: "#166534",
    cardStyle: "elevated",
    backgroundPattern: "crosshatch",
    useGlow: false,
    density: "normal",
    vars: {
      "--background": "#f5f0e8",
      "--foreground": "#1c1208",
      "--card": "#faf7f0",
      "--card-foreground": "#1c1208",
      "--primary": "#c0392b",
      "--primary-foreground": "#faf7f0",
      "--secondary": "#ede8dc",
      "--secondary-foreground": "#3a2a18",
      "--muted": "#e8e0d0",
      "--muted-foreground": "#7a6a50",
      "--border": "#b8a888",
    },
  },
];

const STORAGE_KEY = "xhmi-theme";

export function getStoredThemeId(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "scada-dark";
}

export function applyTheme(theme: HMITheme) {
  const root = document.documentElement;
  // Apply CSS custom properties
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
  root.style.setProperty("--radius", theme.radius);
  root.style.setProperty("--danger", theme.dangerColor);
  root.style.setProperty("--warning", theme.warningColor);
  root.style.setProperty("--success", theme.successColor);
  root.style.setProperty("--font-mono", theme.fontMono);
  // Data attributes for pattern/style variants
  root.setAttribute("data-theme-id", theme.id);
  root.setAttribute("data-card-style", theme.cardStyle);
  root.setAttribute("data-bg-pattern", theme.backgroundPattern);
  root.setAttribute("data-density", theme.density);
  root.setAttribute("data-glow", theme.useGlow ? "true" : "false");
  localStorage.setItem(STORAGE_KEY, theme.id);
}

export function getThemeById(id: string): HMITheme {
  return themes.find((t) => t.id === id) ?? themes[0]!;
}
