// Obsidian's full callout type list — every alias maps to a canonical family
// that decides the color and icon (data-callout holds the family name)
export const CALLOUT_FAMILIES: Record<string, string> = {
  note: "note",
  abstract: "abstract", summary: "abstract", tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip", hint: "tip", important: "tip",
  success: "success", check: "success", done: "success",
  question: "question", help: "question", faq: "question",
  warning: "warning", caution: "warning", attention: "warning",
  failure: "failure", fail: "failure", missing: "failure",
  danger: "danger",
  error: "error",
  bug: "bug",
  example: "example",
  quote: "quote", cite: "quote",
};

export const CALLOUT_DEFAULT_TITLES: Record<string, string> = {
  note: "Note", abstract: "Abstract", summary: "Summary", tldr: "TLDR",
  info: "Info", todo: "Todo",
  tip: "Tip", hint: "Hint", important: "Important",
  success: "Success", check: "Check", done: "Done",
  question: "Question", help: "Help", faq: "FAQ",
  warning: "Warning", caution: "Caution", attention: "Attention",
  failure: "Failure", fail: "Fail", missing: "Missing",
  danger: "Danger", error: "Error", bug: "Bug",
  example: "Example", quote: "Quote", cite: "Cite",
};

export const CALLOUT_RE = /^\[!([\w-]+)\]([+-]?)\s*(.*)$/;

// Canonical families in the order the picker shows them.
export const CALLOUT_TYPES = [
  "note",
  "abstract",
  "info",
  "todo",
  "tip",
  "success",
  "question",
  "warning",
  "failure",
  "danger",
  "error",
  "bug",
  "example",
  "quote",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

export interface CalloutLineInfo {
  rawType: string;
  family: string;
  fold: string;
  title: string;
  // Offsets relative to the full source line
  typeFrom: number;
  typeTo: number;
  titleFrom: number;
}

const BLOCKQUOTE_PREFIX_RE = /^\s*(?:>\s?)+/;

// Container editing shows the callout body without its blockquote markers and
// puts them back on commit. Only one level of ">" is stripped/added, so nested
// lists, code fences and nested quotes keep their relative structure.
export function stripCalloutBody(raw: string): string {
  if (!raw) return "";
  return raw
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n");
}

export function prefixCalloutBody(text: string): string {
  if (text === "") return "";
  return text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

export function parseCalloutLine(lineText: string): CalloutLineInfo | null {
  const prefix = BLOCKQUOTE_PREFIX_RE.exec(lineText)?.[0] ?? "";
  const content = lineText.slice(prefix.length);
  const m = CALLOUT_RE.exec(content);
  if (!m) return null;
  const rawType = m[1].toLowerCase();
  const family = CALLOUT_FAMILIES[rawType];
  if (!family) return null;
  const typeFrom = prefix.length + 2; // after "[!"
  return {
    rawType,
    family,
    fold: m[2],
    title: m[3].trim(),
    typeFrom,
    typeTo: typeFrom + m[1].length,
    titleFrom: prefix.length + m[0].length - m[3].length,
  };
}
