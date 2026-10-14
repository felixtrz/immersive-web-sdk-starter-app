// Runs the autopilot race in headless Chromium and reports:
//  - sampled allocation per frame, grouped by call site (includes short-lived garbage)
//  - retained heap after forced GC across two windows (steady growth = leak)
// Usage: node scripts/profile-heap.mjs   (env: WINDOW_MS, TOP, ONLY_APP=1, URL)
import { chromium } from 'playwright';

const WINDOW_MS = Number(process.env.WINDOW_MS ?? 15000);
const URL = process.env.URL ?? 'http://localhost:5173/?capture=1&autopilot=1';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const [vw, vh] = (process.env.VIEWPORT ?? '1280x720').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__race === 'function' && window.__race() !== null, null, {
  timeout: 60000,
});
await page.waitForTimeout(3000);
await page.mouse.click(vw / 2, vh / 2);
await page.waitForTimeout(8000);

async function retained() {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Runtime.getHeapUsage')).usedSize;
}

function countFrames(ms) {
  return page.evaluate(
    (dur) =>
      new Promise((done) => {
        let n = 0;
        const end = performance.now() + dur;
        const tick = () => {
          if (performance.now() >= end) return done(n);
          n++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

const heap0 = await retained();
await cdp.send('HeapProfiler.startSampling', {
  samplingInterval: 512,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
});
const frameCount = await countFrames(WINDOW_MS);
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const heap1 = await retained();
await page.waitForTimeout(WINDOW_MS);
const heap2 = await retained();

const bySite = new Map();
const byOwner = new Map();
let total = 0;
const label = (f) => {
  const file = (f.url || '(native)').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '');
  return `${f.functionName || '(anon)'}  ${file}:${f.lineNumber + 1}`;
};
const isApp = (f) => /\/src\/(systems|sim|track|index)/.test(f.url);
const isCore = (f) => f.url.includes('@iwsdk_core') || f.url.includes('@iwsdk/core');
// Owner = deepest app-code frame on the stack, else deepest @iwsdk/core frame.
(function walk(node, appOwner, coreOwner) {
  const f = node.callFrame;
  if (isApp(f)) appOwner = label(f);
  else if (isCore(f)) coreOwner = label(f);
  if (node.selfSize > 0) {
    bySite.set(label(f), (bySite.get(label(f)) ?? 0) + node.selfSize);
    const owner = appOwner ? `app  ${appOwner}` : coreOwner ? `core ${coreOwner}` : 'other';
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + node.selfSize);
    total += node.selfSize;
  }
  for (const c of node.children) walk(c, appOwner, coreOwner);
})(profile.head, null, null);

const kb = (b) => (b / 1024).toFixed(1).padStart(9);
console.log(`frames in window: ${frameCount}  (${(frameCount / (WINDOW_MS / 1000)).toFixed(1)} fps)`);
console.log(`sampled allocation: ${kb(total)} KB total, ${(total / Math.max(frameCount, 1)).toFixed(0)} B/frame`);
console.log(`retained heap after GC: t0 ${kb(heap0)} KB  t1 ${kb(heap1)} KB  t2 ${kb(heap2)} KB`);
const keep = process.env.ONLY_APP ? (k) => k.includes('src/') : () => true;
console.log('\ntop allocation sites:');
const rows = [...bySite].filter(([k]) => keep(k)).sort((a, b) => b[1] - a[1]);
for (const [k, v] of rows.slice(0, Number(process.env.TOP ?? 30))) console.log(`${kb(v)} KB  ${k}`);
console.log('\nallocation by owning caller:');
for (const [k, v] of [...byOwner].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 30))) {
  console.log(`${kb(v)} KB  ${(v / Math.max(frameCount, 1)).toFixed(0).padStart(7)} B/f  ${k}`);
}
if (process.env.TRACE) {
  // Aggregate full call paths leading to allocations inside functions named TRACE.
  const paths = new Map();
  (function walk(node, stack) {
    const here = [...stack, node.callFrame.functionName || '(anon)'];
    if (node.callFrame.functionName === process.env.TRACE && node.selfSize >= 0) {
      let size = 0;
      (function sum(n) {
        size += n.selfSize;
        n.children.forEach(sum);
      })(node);
      const key = here.slice(-14).join(' > ');
      paths.set(key, (paths.get(key) ?? 0) + size);
      return;
    }
    for (const c of node.children) walk(c, here);
  })(profile.head, []);
  console.log(`\npaths into ${process.env.TRACE}:`);
  for (const [k, v] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`${kb(v)} KB  ${k}\n`);
}
console.log('\nrace:', JSON.stringify(await page.evaluate(() => window.__race())));
console.log('errors:', errors.slice(0, 5));
await browser.close();
