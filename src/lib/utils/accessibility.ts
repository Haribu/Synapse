export interface AccessibilitySettings {
  fontFamily: "sans" | "dyslexic" | "serif" | "mono";
  fontSize: "sm" | "base" | "lg" | "xl";
  lineSpacing: "normal" | "relaxed" | "spacious";
  letterSpacing: "normal" | "wide" | "wider";
  columnWidth: "narrow" | "normal" | "wide";
  globalDyslexic: boolean;
  hideHeaderImages: boolean;
  hideSponsored: boolean;
  hideRoundups: boolean;
  hideVendors: boolean;
  disableGrouping: boolean;
}

export const DEFAULT_A11Y_SETTINGS: AccessibilitySettings = {
  fontFamily: "sans",
  fontSize: "base",
  lineSpacing: "relaxed",
  letterSpacing: "normal",
  columnWidth: "normal",
  globalDyslexic: false,
  hideHeaderImages: true,
  hideSponsored: false,
  hideRoundups: false,
  hideVendors: false,
  disableGrouping: false,
};

const STORAGE_KEY = "synapse_accessibility_settings";

export function loadAccessibilitySettings(): AccessibilitySettings {
  if (typeof window === "undefined") return DEFAULT_A11Y_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_SETTINGS;
    return { ...DEFAULT_A11Y_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_A11Y_SETTINGS;
  }
}

export function saveAccessibilitySettings(settings: AccessibilitySettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyGlobalAccessibility(settings);
  } catch (err) {
    console.error("Failed to save accessibility settings", err);
  }
}

export function applyGlobalAccessibility(settings: AccessibilitySettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (settings.globalDyslexic) {
    root.setAttribute("data-font", "dyslexic");
  } else {
    root.removeAttribute("data-font");
  }
}
