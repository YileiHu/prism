// Generate the Windows icon set from public/icon.svg using Electron's renderer.
// Produces public/icon.png (512), public/icon-<size>.png and a multi-size public/icon.ico.
import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, "..", "public", "icon.svg");
const outDir = path.join(__dirname, "..", "public");
const SIZES = [512, 256, 128, 64, 48, 32, 24, 16];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Build a PNG-compressed ICO container (Windows Vista+). */
function toIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = header.length + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const p = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, p + 0);
    dir.writeUInt8(size >= 256 ? 0 : size, p + 1);
    dir.writeUInt8(0, p + 2); // palette
    dir.writeUInt8(0, p + 3); // reserved
    dir.writeUInt16LE(1, p + 4); // planes
    dir.writeUInt16LE(32, p + 6); // bpp
    dir.writeUInt32LE(data.length, p + 8);
    dir.writeUInt32LE(offset, p + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

async function generate() {
  await app.whenReady();

  const svgContent = fs.readFileSync(svgPath, "utf-8");
  const html = `<!DOCTYPE html><html><head><style>body{margin:0;overflow:hidden;background:transparent}</style></head><body>${svgContent}</body></html>`;

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Wait for render to complete
  await new Promise((resolve) => setTimeout(resolve, 800));

  const image = await win.webContents.capturePage();
  const pngBuffer = image.toPNG();

  fs.writeFileSync(path.join(outDir, "icon.png"), pngBuffer);
  console.log(`Generated icon.png (${pngBuffer.length} bytes)`);

  const bySize = new Map();
  for (const size of SIZES) {
    const small = image.resize({ width: size, height: size });
    const data = small.toPNG();
    bySize.set(size, data);
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), data);
    console.log(`  icon-${size}.png`);
  }

  const ico = toIco(ICO_SIZES.map((size) => ({ size, data: bySize.get(size) })));
  fs.writeFileSync(path.join(outDir, "icon.ico"), ico);
  console.log(`Generated icon.ico (${ico.length} bytes, ${ICO_SIZES.length} sizes)`);

  console.log("Done!");
  app.quit();
}

generate().catch((err) => {
  console.error(err);
  app.quit();
  process.exit(1);
});
