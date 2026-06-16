import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#181713",
        paper: "#f7f3ea",
        brass: "#b9872f",
        moss: "#536b45",
        signal: "#d84c2f",
        slate: "#2f3a40"
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "serif"],
        body: ["ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 60px rgba(24, 23, 19, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;

