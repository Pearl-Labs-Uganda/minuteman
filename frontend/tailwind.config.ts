import type { Config } from "tailwindcss";

/**
 * Pearl Labs / Minuteman design tokens.
 * Ported verbatim from the original vanilla frontend so the look is identical.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        headline: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        body: ["var(--font-manrope)", "system-ui", "sans-serif"],
        label: ["var(--font-inter)", "system-ui", "sans-serif"],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        "pl-bg": "#0B1628",
        "pl-surf": "#112240",
        "pl-cont": "#162844",
        "pl-edge": "#1e3254",
        "pl-text": "#c8dff0",
        "pl-muted": "#6a8fa8",
        "pl-faint": "#3a576c",
        "pl-navy": "#002D5B",
        "pl-sky": {
          DEFAULT: "#6EAADC",
          light: "#9dc4e8",
          dark: "#4d8fc7",
        },
        "pl-orange": {
          DEFAULT: "#EF8633",
          dark: "#d6721e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
