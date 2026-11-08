// Path inserted for an attachment, per the image_path_style setting:
// "note" (default) = relative to the note's folder (../attachments/x.png),
// "vault" = vault-root-relative, "name" = filename only.
export async function imagePathFor(
  ref: string,
  vaultPath: string,
  notePath: string,
  options: { wrapAngle?: boolean } = {},
): Promise<string> {
  let style = "note";
  try { style = (await window.prism.getSetting("image_path_style")) || "note"; } catch { /* default */ }
  let target = ref;
  if (style === "name") {
    target = ref.split("/").pop() ?? ref;
  } else if (style === "note") {
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const vaultN = norm(vaultPath);
    let dir = norm(notePath);
    dir = dir.slice(0, dir.lastIndexOf("/")); // note's folder
    if (dir === vaultN) dir = "";
    else if (dir.startsWith(vaultN + "/")) dir = dir.slice(vaultN.length + 1);
    const from = dir ? dir.split("/") : [];
    const toL = ref.toLowerCase().split("/");
    let i = 0;
    while (i < from.length && i < toL.length - 1 && from[i] === toL[i]) i++;
    target = "../".repeat(from.length - i) + ref.split("/").slice(i).join("/");
  }
  // Angle brackets keep paths with spaces/parens valid in standard markdown,
  // but wikilink embeds take the raw path
  return options.wrapAngle && /[\s()]/.test(target) ? `<${target}>` : target;
}
