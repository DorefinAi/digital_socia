// Renders each <section class="screen"> of the mockup HTML to a PNG. Usage: node shots.mjs <html> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const require = createRequire("C:/vartmaan/code/digital/backend/apps/worker/package.json");
const { chromium } = require("playwright");
const [html, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(html).href);
const names = { s1: "1-video-queue", s2: "2-editor-title-from-speech", s3: "3-editor-title-from-screen", s4: "4-post-by-hand" };
for (const [id, name] of Object.entries(names)) {
  await page.locator(`#${id}`).screenshot({ path: `${out}/${name}.png` });
  console.log("wrote", name);
}
await browser.close();
