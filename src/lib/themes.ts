export type Appearance = "light" | "dark" | "system";

export interface ThemePreset {
  id: string;
  name: string;
  chrome: string;
  chromeRaised: string;
  chromeText: string;
  chromeMuted: string;
  accent: string;
  accentText: string;
  accentPress: string;
}

export const THEMES: ThemePreset[] = [
  {
    id: "copper",
    name: "Copper",
    chrome: "#1B1714",
    chromeRaised: "#161310",
    chromeText: "#F3ECE1",
    chromeMuted: "#C9B9A6",
    accent: "#C45C26",
    accentText: "#FFF8F3",
    accentPress: "#8F2D14",
  },
  {
    id: "aubergine",
    name: "Aubergine",
    chrome: "#3F0E40",
    chromeRaised: "#350D36",
    chromeText: "#FFFFFF",
    chromeMuted: "#E7D4EA",
    accent: "#1164A3",
    accentText: "#FFFFFF",
    accentPress: "#0B4C8C",
  },
  {
    id: "hoth",
    name: "Hoth",
    chrome: "#0E2744",
    chromeRaised: "#0A1C33",
    chromeText: "#F4F8FC",
    chromeMuted: "#C5D6EA",
    accent: "#1D9BD1",
    accentText: "#042033",
    accentPress: "#1278A8",
  },
  {
    id: "monument",
    name: "Monument",
    chrome: "#1A1D21",
    chromeRaised: "#121416",
    chromeText: "#F8F8F8",
    chromeMuted: "#C7CDD1",
    accent: "#E8E8E8",
    accentText: "#1A1D21",
    accentPress: "#B7BDC2",
  },
  {
    id: "ochin",
    name: "Ochin",
    chrome: "#0E3A2F",
    chromeRaised: "#0A2B23",
    chromeText: "#F3FBF7",
    chromeMuted: "#C6E4D6",
    accent: "#2EB67D",
    accentText: "#042117",
    accentPress: "#1F8F62",
  },
  {
    id: "cinnabar",
    name: "Cinnabar",
    chrome: "#4A1520",
    chromeRaised: "#3A1019",
    chromeText: "#FFF5F6",
    chromeMuted: "#F0C9CF",
    accent: "#E01E5A",
    accentText: "#FFFFFF",
    accentPress: "#B01646",
  },
  {
    id: "sweet",
    name: "Sweet Treat",
    chrome: "#3D163F",
    chromeRaised: "#2E102F",
    chromeText: "#FFF5FB",
    chromeMuted: "#F0C9E4",
    accent: "#E01E7A",
    accentText: "#FFFFFF",
    accentPress: "#B01660",
  },
  {
    id: "banana",
    name: "Banana",
    chrome: "#3A2E0B",
    chromeRaised: "#2C2308",
    chromeText: "#FFF8E6",
    chromeMuted: "#F0DFA8",
    accent: "#ECB22E",
    accentText: "#1D1C1D",
    accentPress: "#C49216",
  },
  {
    id: "nocturne",
    name: "Nocturne",
    chrome: "#0B1E2D",
    chromeRaised: "#071622",
    chromeText: "#F2FBFF",
    chromeMuted: "#C5DCEA",
    accent: "#36C5F0",
    accentText: "#04202A",
    accentPress: "#1A9EC2",
  },
  {
    id: "workhard",
    name: "Work Hard",
    chrome: "#3D2414",
    chromeRaised: "#2E1B0F",
    chromeText: "#FFF6EE",
    chromeMuted: "#E8CDB8",
    accent: "#E07020",
    accentText: "#1D1C1D",
    accentPress: "#B55814",
  },
];

const APPEARANCE_KEY = "df.appearance";
const THEME_KEY = "df.theme";

export function loadAppearance(): Appearance {
  const stored = localStorage.getItem(APPEARANCE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}

export function loadThemeId(): string {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.some((theme) => theme.id === stored) ? stored! : "copper";
}

export function resolveAppearance(appearance: Appearance): "light" | "dark" {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return appearance;
}

export function applyTheme(appearance: Appearance, themeId: string) {
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  root.dataset.appearance = resolveAppearance(appearance);
  root.dataset.theme = theme.id;
  root.style.setProperty("--chrome", theme.chrome);
  root.style.setProperty("--chrome-2", theme.chromeRaised);
  root.style.setProperty("--chrome-text", theme.chromeText);
  root.style.setProperty("--chrome-muted", theme.chromeMuted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-text", theme.accentText);
  root.style.setProperty("--accent-2", theme.accentPress);
  localStorage.setItem(APPEARANCE_KEY, appearance);
  localStorage.setItem(THEME_KEY, theme.id);
}

export function bootTheme() {
  applyTheme(loadAppearance(), loadThemeId());
}
