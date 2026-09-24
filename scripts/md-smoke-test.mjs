import { renderMarkdown, toggleTaskInSource, stripFrontmatter } from "../out/md-test.mjs";

const sample = `---
title: Test Note
tags: [a, b]
rating: 5
---

# Heading 1

A paragraph with **bold**, *italic*, ~~strike~~, ==highlight== and #project/tag plus a [[Wiki Target|custom label]].

- [ ] todo one
- [x] todo two

> [!warning]+ Watch out
> Body **line** here
> second line
>
> - list item in callout
> - another

> [!info] Title only

> [!summary] TL;DR version
> compact content

> [!bug] Crashes on load

> [!tldr]

> [!unknown] Fallback quote

> plain quote

Regular paragraph after quotes that must stay outside callouts.

\`\`\`js
const x = 1;
\`\`\`

| a | b |
|---|---|
| 1 | 2 |
`;

const { html, frontmatter } = renderMarkdown(sample);

// ---- Asset context tests (images / embeds / math) ----
const ctx = { vaultPath: "E:/Vault", noteDir: "notes/sub" };
const mathHtml = renderMarkdown("Inline $a^2+b^2=c^2$ and:\n\n$$\\int_0^1 x\\,dx$$", ctx).html;
const imgHtml = renderMarkdown("![alt text](img/pic.png)", ctx).html;
const imgNoCtx = renderMarkdown("![alt](img/pic.png)").html;
const embedImg = renderMarkdown("![[a.png]]", ctx).html;
const embedMd = renderMarkdown("![[Some Note]]", ctx).html;

const assetChecks = [
  ["inline math rendered", mathHtml.includes('class="katex"') && mathHtml.includes("katex-mathml")],
  ["display math rendered", mathHtml.includes("katex-display")],
  ["local image → prism-file url", imgHtml.includes("prism-file:///asset") && imgHtml.includes("img%2Fpic.png")],
  ["image without ctx → placeholder", imgNoCtx.includes("md-img-missing")],
  ["![[img]] embed → img tag", embedImg.includes("<img") && embedImg.includes("ref=a.png")],
  ["![[note]] embed → wikilink", embedMd.includes('data-wikilink="Some Note"')],
];

let assetFail = 0;
for (const [name, ok] of assetChecks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) assetFail++;
}
const checks = [
  ["frontmatter parsed", frontmatter?.title === "Test Note" && frontmatter?.rating === 5],
  ["frontmatter stripped from body", !html.includes("title: Test Note")],
  ["heading", html.includes("<h1>")],
  ["bold", html.includes("<strong>bold</strong>")],
  ["highlight mark", html.includes("<mark>highlight</mark>")],
  ["tag pill", html.includes('class="md-tag">#project/tag</span>')],
  ["wikilink attrs", html.includes('data-wikilink="Wiki Target"') && html.includes(">custom label</a>")],
  ["task checkbox unchecked", (html.match(/task-list-item-checkbox/g) || []).length === 2],
  ["task checked", html.includes("checked=")],
  ["callout warning", html.includes('data-callout="warning"')],
  ["callout info", html.includes('data-callout="info"')],
  ["callout title text", html.includes('class="callout-title"') && html.includes("Watch out")],
  ["callout body wrapped", html.includes('class="callout-content"') && html.includes("<strong>line</strong>")],
  ["callout content wrappers", (html.match(/class="callout-content"/g) || []).length === 2],
  ["callout list inside content", /callout-content[\s\S]*<ul>/.test(html)],
  ["alias summary → abstract family", html.includes('data-callout="abstract"')],
  ["alias bug family", html.includes('data-callout="bug"')],
  ["alias tldr default title", html.includes(">TLDR</div>")],
  ["title-only callout has no content", !html.split('data-callout="info"')[1].split('<div class="callout"')[0].includes("callout-content")],
  ["blockquote tags balanced", (html.match(/<blockquote>/g) || []).length === 2 && (html.match(/<\/blockquote>/g) || []).length === 2],
  ["callout divs balanced", (html.match(/<div[ >]/g) || []).length === (html.match(/<\/div>/g) || []).length],
  ["plain quote closes before following content", /<\/blockquote>\s*<p>Regular paragraph after/.test(html)],
  ["callout closes before blockquote", /<\/div>\s*<\/div>\s*<blockquote>/.test(html)],
  ["unknown callout stays blockquote", html.includes("<blockquote>")],
  ["code fence with lang", html.includes('data-lang="js"') && html.includes("hljs-keyword")],
  ["table", html.includes("<table>") && html.includes("<th>")],
  ["html injection escaped", renderMarkdown("<img src=x onerror=alert(1)>").html.includes("&lt;img")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) fail++;
}

const toggled = toggleTaskInSource("- [ ] one\n- [ ] two", 1);
console.log(toggled === "- [ ] one\n- [x] two" ? "PASS" : "FAIL", "toggle task index 1");
const untoggled = toggleTaskInSource("- [x] one", 0);
console.log(untoggled === "- [ ] one" ? "PASS" : "FAIL", "untoggle checked task");
const crlf = toggleTaskInSource("- [ ] a\r\n- [ ] b", 0);
console.log(crlf === "- [x] a\r\n- [ ] b" ? "PASS" : "FAIL", "toggle preserves CRLF");

const fm = stripFrontmatter("---\r\nkey: value\r\n---\r\n\r\nbody");
console.log(fm.frontmatter?.key === "value" && fm.body === "\r\nbody" ? "PASS" : "FAIL", "CRLF frontmatter", JSON.stringify(fm));

process.exit(fail + assetFail > 0 ? 1 : 0);
