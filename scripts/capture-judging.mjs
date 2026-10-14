// Captures a fixed evidence set for the judging panel into design/judging/<round>/.
// Usage: node scripts/capture-judging.mjs <round-name>
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.PROOF_URL ?? 'http://localhost:5173/';
const round = process.argv[2] ?? 'round-1';
const OUT = path.resolve('design/judging', round);
const SIZE = { width: 1280, height: 720 };
const RACE_TIMEOUT_MS = 240_000;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function session(query, run) {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries({ capture: '1', ...query })) url.searchParams.set(k, v);
  const page = await browser.newPage({ viewport: SIZE });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await page.goto(url.toString(), { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__race === 'function' && window.__race() !== null, null, { timeout: 60_000 });
  await page.waitForTimeout(5000);
  const shot = async (name) => {
    const file = path.join(OUT, `${name}.png`);
    try {
      await page.screenshot({ path: file, timeout: 90_000 });
    } catch {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: file, timeout: 90_000 });
    }
  };
  const state = () => page.evaluate(() => window.__race());
  await run({ page, shot, state });
  await page.close();
  return errors;
}

await mkdir(OUT, { recursive: true });
const telemetry = [];
const errors = [];

errors.push(...(await session({}, async ({ shot }) => {
  await shot('01-cockpit-idle');
})));

errors.push(...(await session({ autopilot: '1' }, async ({ page, shot, state }) => {
  await page.mouse.click(SIZE.width / 2, 400);
  const start = Date.now();
  // Real-time segments only where the visuals matter; the rest of the race is
  // fast-forwarded through the shared pure sim (window.__fastForward).
  const sample = async (label) => telemetry.push({ label, t: +((Date.now() - start) / 1000).toFixed(1), ...(await state()) });
  await page.waitForTimeout(1500);
  await shot('02-cockpit-countdown');
  await page.waitForTimeout(7000);
  await sample('racing');
  await shot('03-cockpit-racing');
  await page.waitForTimeout(5000);
  await shot('04-cockpit-corner');
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(2500);
  await sample('chase');
  await shot('05-chase-racing');
  await page.waitForTimeout(5000);
  await shot('06-chase-corner');
  telemetry.push({ label: 'ff-to-lap-2', ...(await page.evaluate(() => window.__fastForward(200, 2))) });
  await page.waitForTimeout(6000);
  await shot('07-chase-ghost');
  await page.keyboard.press('KeyC');
  const final = await page.evaluate(() => window.__fastForward(400));
  telemetry.push({ label: 'ff-to-finish', ...final });
  await page.waitForTimeout(2500);
  await shot('08-cockpit-finished');
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(1500);
  await shot('09-chase-finished');
})));

const writeTelemetry = async () => {
  const racing = telemetry.filter((s) => s?.phase === 'racing');
  const last = telemetry.at(-1) ?? {};
  const summary = {
    finished: last.phase === 'finished',
    lapTimes: last.laps ?? [],
    bestLap: last.bestLap ?? null,
    avgSpeedKmh: racing.length ? Math.round(racing.reduce((a, s) => a + s.speedKmh, 0) / racing.length) : 0,
    maxSpeedKmh: Math.max(0, ...racing.map((s) => s.speedKmh)),
    maxAbsLateralM: +Math.max(0, ...racing.map((s) => Math.abs(s.lateral ?? 0))).toFixed(2),
    impactSamples: racing.filter((s) => s.impact > 0.05).length,
    samples: telemetry.length,
    consoleErrors: [...new Set(errors)].slice(0, 20),
  };
  await writeFile(path.join(OUT, 'telemetry.json'), JSON.stringify({ summary, samples: telemetry }, null, 2));
  return summary;
};
await writeTelemetry();

errors.push(...(await session({ cam: 'orbit' }, async ({ page, shot }) => {
  for (const name of ['10-kart-orbit-a', '11-kart-orbit-b', '12-kart-orbit-c']) {
    await shot(name);
    await page.waitForTimeout(5500);
  }
})));

errors.push(...(await session({ cam: 'overview' }, async ({ shot }) => {
  await shot('13-track-overview');
})));

await browser.close();

console.log(JSON.stringify(await writeTelemetry(), null, 2));
