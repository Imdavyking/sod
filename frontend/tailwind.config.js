/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#10201a",
        cream: "#fbf8f2",
        brand: {
          50: "#ecfdf3",
          100: "#d1fadf",
          500: "#12b76a",
          600: "#0a9a58",
          700: "#087a47",
          900: "#064e2e",
        },
        // The dApp screens were written against a dark slate palette. Remapping the scale here
        // gives the whole app a light, GoFundMe-style theme without touching every class.
        slate: {
          50: "#f8faf9",
          100: "#10201a",
          200: "#1d2d26",
          300: "#33433c",
          400: "#4b5a53",
          500: "#66746d",
          600: "#8a9791",
          700: "#d9e1dd",
          800: "#e9eeeb",
          900: "#ffffff",
          950: "#ffffff",
        },
        emerald: {
          300: "#065f46",
          400: "#087a47",
          500: "#0a9a58",
        },
        sky: { 200: "#075985", 300: "#0369a1", 500: "#0ea5e9" },
        amber: { 200: "#92400e", 300: "#b45309", 500: "#f59e0b" },
        red: { 300: "#b91c1c", 500: "#ef4444" },
      },
      boxShadow: {
        card: "0 10px 40px -12px rgba(16,32,26,.18)",
        float: "0 12px 32px -8px rgba(16,32,26,.25)",
      },
    },
  },
  plugins: [],
};
