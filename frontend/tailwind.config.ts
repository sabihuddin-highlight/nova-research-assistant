import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f5f5f4",
          100: "#e7e6e3",
          200: "#c8c6c1",
          300: "#9a9893",
          400: "#6f6d68",
          500: "#535350",
          600: "#3d3d3a",
          700: "#2a2a28",
          800: "#1a1a18",
          900: "#0d0d0c",
          950: "#050505",
          1000: "#000000",
        },
        accent: {
          300: "#a5bcff",
          400: "#7c9eff",
          500: "#5b80ff",
          600: "#3d65f3",
          700: "#3252d4",
        },
        agent: {
          clarity: "#9d7feb",
          research: "#5ec0d7",
          validator: "#d39d3d",
          synthesis: "#5fb88a",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      backgroundImage: {
        "dot-grid":
          "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        "gradient-accent": "linear-gradient(135deg, #5b80ff 0%, #6f6ad8 100%)",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(91,128,255,0.25)",
        "glow-soft": "0 0 40px -8px rgba(91,128,255,0.12)",
      },
      animation: {
        "fade-up": "fadeUp 0.4s cubic-bezier(0.2, 0.65, 0.3, 1) both",
        "fade-in": "fadeIn 0.3s ease both",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
        "shimmer": "shimmer 2.5s linear infinite",
        "float": "float 5s ease-in-out infinite",
        "drift": "drift 18s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        drift: {
          "0%, 100%": { transform: "translate(0px, 0px)" },
          "33%": { transform: "translate(6px, -4px)" },
          "66%": { transform: "translate(-4px, 6px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
