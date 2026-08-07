/** @type {import('tailwindcss').Config} */
const c = (n) => `rgb(var(--c-${n}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // surfaces
        base: c("base"), // app background (was gray-950)
        surface: c("surface"), // headers, modals, cards (was gray-900)
        elevated: c("elevated"), // inputs, menus, chips (was gray-800)
        hover: c("hover"), // hover fills, raised buttons (was gray-700)
        tint: c("tint"), // white-ish tint for toolbar washes
        overlay: c("overlay"), // modal backdrop
        // foreground
        primary: c("primary"), // was gray-100/200
        secondary: c("secondary"), // was gray-300
        tertiary: c("tertiary"), // was gray-400
        muted: c("muted"), // was gray-500
        faint: c("faint"), // was gray-600
        // borders
        line: c("line"), // was gray-800 borders
        strong: c("strong"), // was gray-700/600 borders
        // accent with working alpha modifiers (uses --accent-rgb triplet)
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
