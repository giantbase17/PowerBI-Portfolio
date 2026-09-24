// Turns each <Dashboard>/screenshots/report.html into report.png (1600×1000) and thumbnail.png (800×500).
//
//   npx playwright install chromium   (once)
//   npm run screenshots
//
// Set CHROMIUM_PATH to use an existing Chromium build instead of Playwright's download.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: 1600, height: 1000 };

const dirs = readdirSync(root).filter((d) => existsSync(join(root, d, "screenshots", "report.html")));

async function shoot(browser: Browser, url: string, path: string, deviceScaleFactor: number): Promise<void> {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor });
  await page.goto(url);
  await page.screenshot({ path });
  await page.close();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const d of dirs) {
    const url = pathToFileURL(join(root, d, "screenshots", "report.html")).href;
    await shoot(browser, url, join(root, d, "screenshots", "report.png"), 1);
    await shoot(browser, url, join(root, d, "screenshots", "thumbnail.png"), 0.5);
    console.log(`${d}/screenshots/report.png`);
  }
} finally {
  await browser.close();
}
