// Records gameplay proof videos from the running dev server into design/proof/.
// Usage: node scripts/record-proof.mjs [keyboard|autopilot|all] [autopilotSeconds]
import { mkdir, rename, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.PROOF_URL ?? 'http://localhost:5173/';
const OUT_DIR = path.resolve('design/proof');
const SIZE = { width: 1280, height: 720 };
const mode = process.argv[2] ?? 'all';
const autopilotSeconds = Number(process.argv[3] ?? 110);

async function record(name, url, drive) {
  const tmpDir = path.join(OUT_DIR, `.tmp-${name}`);
  await rm(tmpDir, { recursive: true, force: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmpDir, size: SIZE } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`[${name}] pageerror:`, err.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  await page.mouse.click(SIZE.width / 2, 200);
  await drive(page, async (label) => {
    await page.screenshot({ path: path.join(OUT_DIR, `${name}-${label}.png`) });
  });
  await context.close();
  await browser.close();
  const [file] = (await readdir(tmpDir)).filter((f) => f.endsWith('.webm'));
  await rename(path.join(tmpDir, file), path.join(OUT_DIR, `${name}.webm`));
  await rm(tmpDir, { recursive: true, force: true });
  console.log(`[${name}] saved design/proof/${name}.webm`);
}

await mkdir(OUT_DIR, { recursive: true });

if (mode === 'keyboard' || mode === 'all') {
  await record('keyboard-drive', BASE_URL, async (page, still) => {
    await still('00-idle');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(4000);
    await still('01-countdown');
    await page.waitForTimeout(5000);
    await still('02-accelerating');
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(3000);
    await still('03-driving');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('Space');
    await page.waitForTimeout(2500);
    await page.keyboard.up('Space');
    await still('04-braked');
  });
}

if (mode === 'autopilot' || mode === 'all') {
  const url = new URL(BASE_URL);
  url.searchParams.set('autopilot', '1');
  await record('autopilot-laps', url.toString(), async (page, still) => {
    await still('000s');
    const step = 10;
    for (let t = step; t <= autopilotSeconds; t += step) {
      await page.waitForTimeout(step * 1000);
      await still(`${String(t).padStart(3, '0')}s`);
    }
  });
}
