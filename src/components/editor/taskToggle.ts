// Flip the nth "[ ]"/"[x]" checkbox in the source document (reading-view
// checkbox clicks map here by document order)
export function toggleTaskInSource(src: string, taskIndex: number): string | null {
  const lines = src.split("\n");
  const taskLineRe = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = taskLineRe.exec(lines[i]);
    if (!m) continue;
    if (seen === taskIndex) {
      const prefix = m[1];
      lines[i] = prefix + (m[2] === " " ? "x" : " ") + lines[i].slice(prefix.length + 1);
      return lines.join("\n");
    }
    seen++;
  }
  return null;
}
