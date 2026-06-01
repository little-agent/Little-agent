import type { DashboardTheme, ThemeTypography, ThemeLayout } from "./types";

/**
 * Built-in dashboard themes.
 *
 * Each theme defines its own palette, typography, and layout so switching
 * themes produces visible changes beyond just color — fonts, density, and
 * corner-radius all shift to match the theme's personality.
 *
 * Theme names must stay in sync with the backend's
 * `_BUILTIN_DASHBOARD_THEMES` list in `little_cli/web_server.py`.
 */

// ---------------------------------------------------------------------------
// Shared typography / layout presets
// ---------------------------------------------------------------------------

const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

const OUTFIT_SANS =
  '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const JETBRAINS_MONO =
  '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontSans: OUTFIT_SANS,
  fontMono: JETBRAINS_MONO,
  fontUrl:
    "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
  baseSize: "15px",
  lineHeight: "1.55",
  letterSpacing: "0",
};

const DEFAULT_LAYOUT: ThemeLayout = {
  radius: "0.5rem",
  density: "comfortable",
};

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export const defaultTheme: DashboardTheme = {
  name: "default",
  label: "Little Obsidian Glow",
  description: "Obsidian space void with sleek amethyst gradients & custom ambient glassmorphism",
  palette: {
    background: { hex: "#060409", alpha: 1 },
    midground: { hex: "#e9e4f5", alpha: 1 },
    foreground: { hex: "#a855f7", alpha: 0 },
    warmGlow: "radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.28) 0%, transparent 60%), radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.22) 0%, transparent 60%)",
    noiseOpacity: 0.55,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0.375rem",
  },
  componentStyles: {
    sidebar: {
      background: "rgba(11, 8, 17, 0.45)",
      backdropBlur: "16px",
      borderRight: "1px solid rgba(233, 228, 245, 0.08)",
    },
    card: {
      background: "rgba(15, 11, 23, 0.4)",
      backdropBlur: "12px",
      border: "1px solid rgba(233, 228, 245, 0.08)",
      boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.35)",
    },
    header: {
      background: "rgba(8, 5, 12, 0.75)",
      backdropBlur: "12px",
      borderBottom: "1px solid rgba(233, 228, 245, 0.08)",
    },
    badge: {
      background: "rgba(168, 85, 247, 0.1)",
      border: "1px solid rgba(168, 85, 247, 0.22)",
      color: "#d8b4fe",
    },
    tab: {
      background: "rgba(233, 228, 245, 0.03)",
      border: "1px solid rgba(233, 228, 245, 0.06)",
    },
    progress: {
      background: "rgba(168, 85, 247, 0.1)",
      barBackground: "linear-gradient(90deg, #a855f7 0%, #06b6d4 100%)",
    },
  },
  customCSS: `
    /* Add subtle ambient anim to the backdrop glow */
    @keyframes subtle-nebula {
      0% { filter: hue-rotate(0deg) brightness(1); }
      50% { filter: hue-rotate(15deg) brightness(1.1); }
      100% { filter: hue-rotate(0deg) brightness(1); }
    }
    :root {
      animation: subtle-nebula 20s infinite ease-in-out;
    }
    
    /* Elegant space cockpit Dot-Matrix telemetry background grid overlay */
    #root::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      background-image: radial-gradient(rgba(168, 85, 247, 0.08) 1.2px, transparent 1.2px);
      background-size: 28px 28px;
      opacity: 0.85;
    }
    
    /* Make scrollbars thin, rounded, and elegant */
    ::-webkit-scrollbar {
      width: 6.5px;
      height: 6.5px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(233, 228, 245, 0.12);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(233, 228, 245, 0.25);
    }
    
    /* Enhance sidebar headings & active items styling with linear-gradient neon indicator */
    #app-sidebar ul li a.active {
      background: rgba(168, 85, 247, 0.09) !important;
      box-shadow: inset 4px 0 16px rgba(168, 85, 247, 0.08);
      font-weight: 600;
      position: relative;
    }
    #app-sidebar ul li a.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 15%;
      height: 70%;
      width: 3px;
      background: linear-gradient(180deg, #a855f7 0%, #06b6d4 100%);
      border-radius: 999px;
      box-shadow: 0 0 8px rgba(168, 85, 247, 0.6);
    }
    
    /* Soft border glows on cards on hover with transform zoom */
    .bg-card {
      transition: border 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease !important;
    }
    .bg-card:hover {
      border-color: rgba(168, 85, 247, 0.25) !important;
      box-shadow: 0 16px 40px 0 rgba(168, 85, 247, 0.06), 0 12px 36px 0 rgba(0, 0, 0, 0.5) !important;
      transform: translateY(-2.5px);
    }

    /* Refined inputs glow */
    input:focus, textarea:focus, select:focus {
      outline: none !important;
      border-color: rgba(168, 85, 247, 0.35) !important;
      box-shadow: 0 0 12px rgba(168, 85, 247, 0.15) !important;
    }
    
    /* Custom primary buttons premium styling */
    button.bg-primary {
      background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%) !important;
      border: none !important;
      box-shadow: 0 4px 14px rgba(168, 85, 247, 0.25) !important;
      transition: transform 0.15s ease, box-shadow 0.15s ease !important;
    }
    button.bg-primary:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 18px rgba(168, 85, 247, 0.4) !important;
    }
    button.bg-primary:active {
      transform: translateY(0) !important;
    }
    
    /* Elegant typography glows */
    h1, h2, h3, .text-display {
      letter-spacing: -0.015em !important;
      text-shadow: 0 0 24px rgba(168, 85, 247, 0.08);
    }

    /* Live pulsing glowing indicators for heartbeats */
    .bg-success {
      box-shadow: 0 0 8px rgba(74, 222, 128, 0.5) !important;
      animation: pulse-green 2s infinite ease-in-out;
    }
    @keyframes pulse-green {
      0% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.3); opacity: 0.85; }
      50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.7); opacity: 1; }
      100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.3); opacity: 0.85; }
    }
  `,
};

export const midnightTheme: DashboardTheme = {
  name: "midnight",
  label: "Midnight",
  description: "Deep blue-violet with cool accents",
  palette: {
    background: { hex: "#0a0a1f", alpha: 1 },
    midground: { hex: "#d4c8ff", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(167, 139, 250, 0.32)",
    noiseOpacity: 0.8,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Inter", ${SYSTEM_SANS}`,
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
    letterSpacing: "-0.005em",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0.75rem",
  },
};

export const emberTheme: DashboardTheme = {
  name: "ember",
  label: "Ember",
  description: "Warm crimson and bronze — forge vibes",
  palette: {
    background: { hex: "#1a0a06", alpha: 1 },
    midground: { hex: "#ffd8b0", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(249, 115, 22, 0.38)",
    noiseOpacity: 1,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Spectral", Georgia, "Times New Roman", serif`,
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0.25rem",
  },
  colorOverrides: {
    destructive: "#c92d0f",
    warning: "#f97316",
  },
};

export const monoTheme: DashboardTheme = {
  name: "mono",
  label: "Mono",
  description: "Clean grayscale — minimal and focused",
  palette: {
    background: { hex: "#0e0e0e", alpha: 1 },
    midground: { hex: "#eaeaea", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(255, 255, 255, 0.1)",
    noiseOpacity: 0.6,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0",
  },
};

export const cyberpunkTheme: DashboardTheme = {
  name: "cyberpunk",
  label: "Cyberpunk",
  description: "Neon green on black — matrix terminal",
  palette: {
    background: { hex: "#040608", alpha: 1 },
    midground: { hex: "#9bffcf", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(0, 255, 136, 0.22)",
    noiseOpacity: 1.2,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Share Tech Mono", "JetBrains Mono", ${SYSTEM_MONO}`,
    fontMono: `"Share Tech Mono", "JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;700&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0",
  },
  colorOverrides: {
    success: "#00ff88",
    warning: "#ffd700",
    destructive: "#ff0055",
  },
};

export const roseTheme: DashboardTheme = {
  name: "rose",
  label: "Rosé",
  description: "Soft pink and warm ivory — easy on the eyes",
  palette: {
    background: { hex: "#1a0f15", alpha: 1 },
    midground: { hex: "#ffd4e1", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(249, 168, 212, 0.3)",
    noiseOpacity: 0.9,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Fraunces", Georgia, serif`,
    fontMono: `"DM Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=DM+Mono:wght@400;500&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "1rem",
  },
};

/**
 * Same look as ``defaultTheme`` but with a larger root font size, looser
 * line-height, and ``spacious`` density so every rem-based size in the
 * dashboard scales up. For users who find the default 15px UI too dense.
 */
export const defaultLargeTheme: DashboardTheme = {
  name: "default-large",
  label: "Little Obsidian Glow (Large)",
  description: "Little Obsidian Glow with bigger fonts and roomier spacing",
  palette: defaultTheme.palette,
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    baseSize: "18px",
    lineHeight: "1.65",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    density: "spacious",
  },
  componentStyles: defaultTheme.componentStyles,
  customCSS: defaultTheme.customCSS,
};

export const BUILTIN_THEMES: Record<string, DashboardTheme> = {
  default: defaultTheme,
  "default-large": defaultLargeTheme,
  midnight: midnightTheme,
  ember: emberTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  rose: roseTheme,
};
