/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./entrypoints/**/*.{html,ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"],
  },
};
