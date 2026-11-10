// Language ids offered by the block toolbar and right-click insert menu.
// Kept in a tiny module so importing the list doesn't pull highlight.js into
// the editor bundle — the highlighter is loaded lazily by the code card.
// Game-development languages are pinned to the top; the rest follow.
export const COMMON_CODE_LANGUAGES = [
  "text",
  "cpp",
  "csharp",
  "lua",
  "python",
  "c",
  "javascript",
  "typescript",
  "java",
  "go",
  "rust",
  "json",
  "yaml",
  "bash",
  "html",
  "css",
  "sql",
  "markdown",
  "diff",
] as const;
