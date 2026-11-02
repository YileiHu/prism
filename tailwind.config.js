/** @type {import('tailwindcss').Config} */
const c = (n) => `rgb(var(--c-${n}) / <alpha-value>)`;
const s = (n) => `rgb(var(--${n}) / <alpha-value>)`;

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
        // semantic status colors (RGB triplets, light-mode overridden in index.css)
        danger: s("danger"),
        success: s("success"),
        warning: s("warning"),
        info: s("info"),
        "on-accent": s("on-accent"),
        "on-danger": s("on-danger"),
      },
      borderRadius: {
        chip: "4px",
        control: "8px",
        card: "12px",
      },
      boxShadow: {
        popover: "0 12px 32px -8px rgb(0 0 0 / 0.45)",
        modal: "0 24px 64px -16px rgb(0 0 0 / 0.55)",
        drag: "0 16px 40px -12px rgb(0 0 0 / 0.5)",
        toast: "0 8px 24px -8px rgb(0 0 0 / 0.4)",
      },
      fontSize: {
        meta: ["11px", { lineHeight: "1.4" }],
        caption: ["12px", { lineHeight: "1.4" }],
        control: ["13px", { lineHeight: "1.4" }],
        body: ["14px", { lineHeight: "1.5" }],
        section: ["16px", { lineHeight: "1.4" }],
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.16, 1, 0.3, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      zIndex: {
        "menu-backdrop": "90",
        menu: "95",
        context: "100",
        toast: "120",
      },
    },
  },
  plugins: [],
};
