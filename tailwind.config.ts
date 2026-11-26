import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', '"SF Pro Display"', "var(--font-inter)", '"Segoe UI"', "system-ui", "sans-serif"],
      },
      colors: {
        // Apple system colours
        ios: {
          blue: "#007AFF",
          blueDark: "#0063D1",
          green: "#34C759",
          orange: "#FF9500",
          red: "#FF3B30",
          yellow: "#FFCC00",
          teal: "#30B0C7",
          indigo: "#5856D6",
          purple: "#AF52DE",
          gray: "#8E8E93",
          label: "#1C1C1E",
          secondary: "#3C3C4399",
          fill: "#7878801F",
          separator: "#3C3C4329",
        },
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        glass: "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 32px rgba(31, 41, 79, 0.08)",
        float: "0 20px 60px rgba(31, 41, 79, 0.16)",
        pill: "0 1px 3px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)",
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(8px) scale(0.99)" }, "100%": { opacity: "1", transform: "none" } },
      },
      animation: {
        rise: "rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
