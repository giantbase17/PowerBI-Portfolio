// Turns each <Dashboard>/screenshots/report.html into report.png (1600x1000) and thumbnail.png (800x500).
//   npm i -D playwright && npx playwright install chromium
//   node scripts/render-screenshots.mjs
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirs = readdirSync(root).filter((d) => existsSync(join(root, d, "screenshots", "report.html")));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const d of dirs) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(pathToFileURL(join(root, d, "screenshots", "report.html")).href);
  await page.screenshot({ path: join(root, d, "screenshots", "report.png") });
  const thumb = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 0.5 });
  await thumb.goto(pathToFileURL(join(root, d, "screenshots", "report.html")).href);
  await thumb.screenshot({ path: join(root, d, "screenshots", "thumbnail.png") });
  console.log(`${d}/screenshots/report.png`);
}
await browser.close();
