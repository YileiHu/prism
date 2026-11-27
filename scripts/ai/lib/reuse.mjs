// Reuse and style checks for Prism's renderer source.
//
// Used by scripts/ai/check-docs.mjs (section 14). The goal is to make
// "reuse the existing control / helper / token" a hard gate instead of a
// convention that only lives in prose:
//
//   - no Tailwind palette classes or bare hex colors in components
//   - no native `type="number"` inputs (use NumericInput)
//   - no duplicate value exports across shared modules
//   - every shared component must be listed in docs/guides/ui-kit.md
//
// Only Node built-ins are used so the scripts run without npm install.

import path from "node:path";
import { read, walk } from "./reference.mjs";

// Files that are the source of color data, not consumers of the palette.
// Keep this list short and always document why a file is exempt.
const COLOR_DATA_FILES = new Map([
  ["src/shared/themes.ts", "theme surface/accent data"],
  ["src/shared/settings.ts", "default markdown heading/bold colors"],
  ["src/lib/colors.ts", "tag/resource color palette"],
  ["src/components/pdf/pdfjs.ts", "PDF canvas white background"],
]);

// DropdownMenu is a low-level primitive, not the way to build a picker. Value
// selection must go through SelectButton; only these files build a custom menu,
// each for a reason that is not "choose a value from a list".
const DROPDOWN_MENU_FILES = new Map([
  ["src/components/SelectButton.tsx", "standard select trigger"],
  ["src/components/ContextMenu.tsx", "right-click menu items"],
  ["src/components/BatchActionBar.tsx", "batch action menu"],
  ["src/components/ChipTabs.tsx", "overflow more-menu"],
  ["src/components/ThemeQuickMenu.tsx", "theme picker menu"],
  ["src/components/toolbar/AppToolbar.tsx", "toolbar overflow menu"],
  ["src/components/library/PdfLibraryContent.tsx", "icon sort menu"],
  ["src/dev/ControlShowcase.tsx", "control showcase demo"],
]);

const DROPDOWN_IMPORT_RE =
  /import\s*\{[^}]*\bDropdownMenu\b[^}]*\}\s*from\s*["'][^"']*DropdownMenu["']/;

const PALETTE_COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PALETTE_UTILITIES =
  "bg|text|border|border-[trblxy]|ring|ring-offset|from|via|to|fill|stroke|divide|outline|decoration|placeholder|accent|caret|shadow";
const PALETTE_RE = new RegExp(
  `\\b(?:${PALETTE_UTILITIES})-(?:${PALETTE_COLORS})-\\d{2,3}\\b`,
  "g",
);
const NEUTRAL_RE =
  /\b(?:bg|text|border|border-[trblxy]|ring|fill|stroke|divide)-(?:white|black)\b/g;
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const NATIVE_NUMBER_RE = /type\s*=\s*["']number["']/g;

/** Blank out comments while preserving line numbers. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .split(/\r?\n/)
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function matches(text, regex) {
  const out = [];
  regex.lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    out.push({ value: match[0], line: lineOf(text, match.index) });
  }
  return out;
}

function valueExports(text) {
  const names = new Set();
  for (const match of text.matchAll(
    /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(
    /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(match[1]);
  }
  return [...names];
}

function sourceFiles() {
  return walk("src", [".ts", ".tsx"]).filter((file) => !file.endsWith(".d.ts"));
}

function checkStyleRules() {
  const errors = [];

  for (const file of sourceFiles()) {
    const clean = stripComments(read(file));

    for (const match of matches(clean, PALETTE_RE)) {
      errors.push(
        `${file}:${match.line}: hardcoded tailwind palette class "${match.value}"; use semantic tokens (docs/guides/ui-kit.md)`,
      );
    }
    for (const match of matches(clean, NEUTRAL_RE)) {
      errors.push(
        `${file}:${match.line}: hardcoded "${match.value}"; use semantic tokens (docs/guides/ui-kit.md)`,
      );
    }
    if (!COLOR_DATA_FILES.has(file)) {
      for (const match of matches(clean, HEX_RE)) {
        errors.push(
          `${file}:${match.line}: hardcoded color "${match.value}"; use semantic tokens, or add the file to COLOR_DATA_FILES in scripts/ai/lib/reuse.mjs`,
        );
      }
    }
    for (const match of matches(clean, NATIVE_NUMBER_RE)) {
      errors.push(
        `${file}:${match.line}: native type="number"; use NumericInput (src/components/NumericInput.tsx) or explain the exception in scripts/ai/lib/reuse.mjs`,
      );
    }
  }

  return { errors };
}

function checkDuplicateExports() {
  const errors = [];
  const files = [
    ...walk("src/lib", [".ts", ".tsx"]),
    ...walk("src/components", [".ts", ".tsx"]),
    ...walk("src/shared", [".ts", ".tsx"]),
  ];
  const owners = new Map();

  for (const file of files) {
    for (const name of valueExports(stripComments(read(file)))) {
      if (!owners.has(name)) owners.set(name, []);
      owners.get(name).push(file);
    }
  }

  for (const [name, list] of [...owners.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length < 2) continue;
    errors.push(
      `duplicate export "${name}" in ${list.join(" and ")}; reuse one implementation or rename before adding a second copy`,
    );
  }

  return { errors };
}

function checkSharedComponentDocs() {
  const errors = [];
  const uiKit = read("docs/guides/ui-kit.md");
  const shared = walk("src/components", [".tsx"]).filter(
    (file) => path.posix.dirname(file) === "src/components",
  );

  for (const file of shared) {
    const name = path.posix.basename(file, ".tsx");
    if (!uiKit.includes(name)) {
      errors.push(
        `${file}: new shared component is not listed in docs/guides/ui-kit.md (add a row, or move it under src/components/<module>/ if it is module-private)`,
      );
    }
  }

  return { errors };
}

function checkDropdownUsage() {
  const errors = [];
  for (const file of sourceFiles()) {
    if (DROPDOWN_MENU_FILES.has(file)) continue;
    if (DROPDOWN_IMPORT_RE.test(stripComments(read(file)))) {
      errors.push(
        `${file}: imports DropdownMenu directly. Value pickers must use SelectButton (docs/guides/ui-kit.md); a genuinely custom menu must be registered in DROPDOWN_MENU_FILES in scripts/ai/lib/reuse.mjs with a reason.`,
      );
    }
  }
  return { errors };
}

export function checkReuse() {
  const style = checkStyleRules();
  const duplicates = checkDuplicateExports();
  const docs = checkSharedComponentDocs();
  const dropdowns = checkDropdownUsage();
  return {
    errors: [...style.errors, ...duplicates.errors, ...docs.errors, ...dropdowns.errors],
    warnings: [],
    checkedFiles: sourceFiles().length,
  };
}
