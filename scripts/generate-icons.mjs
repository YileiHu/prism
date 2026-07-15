// Generate PNG icons from SVG using Electron's renderer
import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, "..", "public", "icon.svg");
const outDir = path.join(__dirname, "..", "public");

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
  fs.writeFileSync(path.join(outDir, "icon-512.png"), pngBuffer);
  console.log(`Generated icon.png (${pngBuffer.length} bytes)`);

  // Also generate smaller sizes
  for (const size of [256, 128, 64, 48, 32]) {
    const smallImg = image.resize({ width: size, height: size });
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), smallImg.toPNG());
    console.log(`  icon-${size}.png`);
  }

  console.log("Done!");
  app.quit();
}

generate().catch((err) => {
  console.error(err);
  app.quit();
  process.exit(1);
});
