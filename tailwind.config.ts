import type { Config } from "tailwindcss";

// MetaMed Design System, mapped onto Tailwind's palette names so existing
// utility classes pick up the brand. Hex values mirror src/styles/metamed-tokens.css.
const deep = { 500: "#4C5E75", 600: "#3A4A5F", 700: "#2C394B", 800: "#232E3D", 900: "#1B2430", 950: "#12181F" };
const mist = { 50: "#FAF9F9", 100: "#F3F2F2", 200: "#E8E7E7", 300: "#D8D6D6", 400: "#BAB8B7", 500: "#94918F", 600: "#6E6B69", 700: "#4E4B4A" };
const blue = {
  50: "#EEF2F8",
  100: "#DCE4F0",
  200: "#B9C7DE",
  300: "#93A6C8",
  400: "#6B84AC",
  500: "#4A6491",
  600: "#3A5680",
  700: "#304C72",
  800: "#28405F",
  900: "#20334C",
  950: "#20334C",
};

// Neutral ramp: Mist for surfaces and borders, Deep for ink. 500/600 use the
// design system's muted text steps (mist-600/700) so secondary copy keeps AA contrast.
const gray = {
  50: mist[50],
  100: mist[100],
  200: mist[200],
  300: mist[300],
  400: mist[400],
  500: mist[600],
  600: mist[700],
  700: deep[700],
  800: deep[800],
  900: deep[900],
  950: deep[950],
};

// State hues. 50/500/600/700 come from the design system; the other steps are
// tints/shades derived from them so existing classes have a value.
const green = { 50: "#EAF3EF", 100: "#D9EAE4", 200: "#B6D6CA", 300: "#8CBFAC", 400: "#5CA589", 500: "#2E8B68", 600: "#1F7A5C", 700: "#16604A", 800: "#124D3B", 900: "#0E3E30", 950: "#0A2B21" };
const amber = { 50: "#FBF3E6", 100: "#F5E6CE", 200: "#ECD1A5", 300: "#E3BA78", 400: "#D9A34B", 500: "#D08C1E", 600: "#B0730F", 700: "#8A5A0B", 800: "#6E4809", 900: "#563807", 950: "#3A2605" };
const red = { 50: "#FAEDEE", 100: "#F2D5D7", 200: "#E7B2B6", 300: "#DC8C92", 400: "#D0656D", 500: "#C43F49", 600: "#AC2E38", 700: "#8A242C", 800: "#6E1D23", 900: "#56161B", 950: "#3B0F12" };

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        deep,
        mist,
        navy: deep[900],
        brand: {
          blue: blue[700],
          navy: deep[900],
          mist: mist[300],
          ink: deep[900],
        },
        // Categorical set for the five major areas, built only from brand ramps.
        area: {
          1: blue[700],
          2: deep[900],
          3: blue[400],
          4: mist[500],
          5: blue[200],
        },
        blue,
        gray,
        emerald: green,
        green,
        amber,
        red,
      },
      fontFamily: {
        sans: ["Poppins", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Poppins", "Helvetica Neue", "Arial", "sans-serif"],
        brand: ["Cal Sans", "Poppins", "sans-serif"],
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(27,36,48,.06)",
        sm: "0 1px 3px rgba(27,36,48,.08), 0 1px 2px rgba(27,36,48,.04)",
        DEFAULT: "0 1px 3px rgba(27,36,48,.08), 0 1px 2px rgba(27,36,48,.04)",
        md: "0 4px 12px rgba(27,36,48,.08), 0 1px 3px rgba(27,36,48,.05)",
        lg: "0 12px 32px rgba(27,36,48,.12), 0 2px 6px rgba(27,36,48,.06)",
        xl: "0 24px 60px rgba(27,36,48,.18)",
        "2xl": "0 24px 60px rgba(27,36,48,.18)",
        focus: "0 0 0 3px rgba(48,76,114,.28)",
      },
      letterSpacing: {
        tight: "-.02em",
        snug: "-.01em",
        caps: ".08em",
      },
      transitionDuration: {
        DEFAULT: "140ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(.2,0,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
