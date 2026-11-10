import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import yamlLang from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import lua from "highlight.js/lib/languages/lua";
import markdownLang from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import ini from "highlight.js/lib/languages/ini";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("yaml", yamlLang);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("java", java);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("markdown", markdownLang);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("toml", ini);

export const CODE_HIGHLIGHT_LIMIT = 100_000;

export interface HighlightResult {
  html: string;
  lang: string;
  highlighted: boolean;
}

export function escapeCodeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function highlightCode(code: string, lang: string): HighlightResult {
  const safeLang = lang.trim().split(/\s+/)[0].toLowerCase();
  if (code.length > CODE_HIGHLIGHT_LIMIT) {
    return { html: escapeCodeHtml(code), lang: safeLang, highlighted: false };
  }
  if (safeLang && hljs.getLanguage(safeLang)) {
    try {
      return {
        html: hljs.highlight(code, { language: safeLang, ignoreIllegals: true }).value,
        lang: safeLang,
        highlighted: true,
      };
    } catch {
      // fall through to escaped plain text
    }
  }
  return { html: escapeCodeHtml(code), lang: safeLang, highlighted: false };
}
