import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["better-sqlite3", "electron"],
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
  ],
  base: "./",
  // Electron's main process loads http://localhost:5173 directly; without
  // strictPort Vite would silently move to another port and the window would
  // stay stuck on a dead server.
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep the heavy document stacks out of the initial chunk. Each is
        // still loaded on demand through DocumentPane's lazy imports.
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (!path.includes("/node_modules/")) return undefined;
          if (path.includes("/node_modules/pdfjs-dist/")) return "pdfjs";
          if (path.includes("/node_modules/@codemirror/") || path.includes("/node_modules/@lezer/")) return "codemirror";
          // KaTeX renders edit-mode math too, so it stays a separate chunk that
          // the editor pulls without the full markdown stack.
          if (path.includes("/node_modules/katex/")) return "katex";
          if (
            path.includes("/node_modules/markdown-it") ||
            path.includes("/node_modules/@mdit/") ||
            path.includes("/node_modules/highlight.js/") ||
            path.includes("/node_modules/js-yaml/")
          ) return "markdown";
          if (path.includes("/node_modules/@xyflow/") || path.includes("/node_modules/d3-")) return "canvas";
          if (
            path.includes("/node_modules/react/") ||
            path.includes("/node_modules/react-dom/") ||
            path.includes("/node_modules/scheduler/")
          ) return "react";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
