/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// `npm run dev` entry point: a thin, idempotent supervisor for the IWSDK
// runtime (Vite + headless managed browser).
//
// Why not just `iwsdk dev restart --foreground`? The v0 sandbox launches
// `npm run dev` repeatedly — after every `npm ci`, at the end of agent turns —
// often while an earlier run is still alive. A foreground restart kills the
// healthy runtime and its managed browser every time. Instead:
//
//   * The runtime is started detached (`iwsdk dev up`), so it is not owned by
//     any particular `npm run dev` process and survives it being killed.
//   * Each launch attaches to a healthy runtime rather than replacing it. The
//     runtime is only (re)started when it is missing, or when node_modules was
//     reinstalled after it started (a server that lost its deps mid-flight).
//   * Only the newest supervisor stays: older ones notice they were superseded
//     and exit quietly, so supervisors never pile up.
//   * The supervisor prints a Vite-style ready banner once the server answers
//     HTTP, which is what the platform waits for, and then streams only new
//     runtime log lines (never stale errors from an earlier session).
//   * A watchdog relaunches the runtime if it ever dies.
//
// Ctrl+C in an interactive terminal stops the runtime (`iwsdk dev down`).
// Platform signals (SIGTERM/SIGHUP) only detach and leave it running.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { needsSetup } from './setup-browser-deps.mjs';

const root = process.cwd();
const runtimeDir = path.join(root, '.iwsdk', 'runtime');
const sessionFile = path.join(runtimeDir, 'session.json');
const logsDir = path.join(runtimeDir, 'logs');
const supervisorFile = path.join(runtimeDir, 'dev-supervisor.json');
const installMarker = path.join(root, 'node_modules', '.package-lock.json');
const isWindows = process.platform === 'win32';

const POLL_MS = 1000;
const HEALTH_EVERY_POLLS = 5;
const READY_TIMEOUT_MS = 120_000;
const SUPERSEDE_SETTLE_MS = 750;

const startedAt = Date.now();

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iwsdk(args, capture = false) {
  return spawnSync('iwsdk', args, {
    cwd: root,
    shell: isWindows,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
}

function isAlive(pid) {
  if (typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function mtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// --- Single active supervisor (newest wins) ---------------------------------

function claimSupervisor() {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    supervisorFile,
    JSON.stringify({ pid: process.pid, startedAt }),
  );
}

function isSuperseded() {
  const owner = readJson(supervisorFile);
  return (
    owner != null &&
    owner.pid !== process.pid &&
    owner.startedAt >= startedAt &&
    isAlive(owner.pid)
  );
}

function exitIfSuperseded() {
  if (!isSuperseded()) return;
  log('A newer `npm run dev` took over supervision; exiting (runtime untouched).');
  process.exit(0);
}

// --- Stale Chromium profile locks --------------------------------------------
//
// The managed browser profile lives under /tmp, which in the v0 sandbox sits
// on the persistent disk. When the VM is replaced, the old VM's SingletonLock
// (a symlink to "<host>-<pid>") survives, and Chromium refuses to launch with
// "profile appears to be in use by another Chromium process on another
// computer". Remove locks whose owning process is not alive on this machine.

const browserProfilesDir = path.join(
  '/tmp',
  `.iwsdk-browser-${typeof process.getuid === 'function' ? process.getuid() : ''}`,
);
const SINGLETON_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

function clearStaleBrowserLocks() {
  let profiles;
  try {
    profiles = fs.readdirSync(browserProfilesDir);
  } catch {
    return;
  }
  for (const name of profiles) {
    const profile = path.join(browserProfilesDir, name);
    let target;
    try {
      target = fs.readlinkSync(path.join(profile, 'SingletonLock'));
    } catch {
      continue;
    }
    const pid = Number(target.slice(target.lastIndexOf('-') + 1));
    if (Number.isInteger(pid) && isAlive(pid)) continue;
    for (const file of SINGLETON_FILES) {
      fs.rmSync(path.join(profile, file), { force: true });
    }
    log(`Removed stale Chromium profile lock (${target}) left by a previous VM.`);
  }
}

function hasProfileLockIssue(status) {
  const message = status?.state?.browserIssue?.message ?? '';
  return message.includes('profile appears to be in use');
}

// --- Runtime health ----------------------------------------------------------

function readStatus() {
  const result = iwsdk(['dev', 'status'], true);
  try {
    return JSON.parse(result.stdout)?.data ?? null;
  } catch {
    return null;
  }
}

function runtimeState() {
  const status = readStatus();
  const session = readJson(sessionFile);
  const running =
    status?.state?.running === true && isAlive(session?.pid ?? null);
  if (!running) return { kind: 'missing', status };
  // `npm ci` deletes and rebuilds node_modules. A runtime that was serving
  // during that window has broken module resolution, so restart it once.
  if (mtimeMs(installMarker) > mtimeMs(sessionFile)) {
    return { kind: 'stale', status };
  }
  // Vite is up but the browser died on a stale profile lock; the runtime does
  // not retry the launch by itself, so clear the lock and restart once.
  if (hasProfileLockIssue(status)) {
    return { kind: 'browser-locked', status };
  }
  return { kind: 'healthy', status };
}

function ensureRuntime() {
  clearStaleBrowserLocks();
  const state = runtimeState();
  if (state.kind === 'healthy') {
    log('Attached to the running IWSDK runtime (managed browser left untouched).');
    return true;
  }
  const restart = state.kind === 'stale' || state.kind === 'browser-locked';
  // On a fresh VM the browser's system libraries (and possibly Chromium) must
  // be installed first, which can take minutes. Serve Vite immediately without
  // the browser, and open it once background setup finishes.
  const deferBrowser = needsSetup();
  const args = [
    'dev',
    restart ? 'restart' : 'up',
    '--headless',
    ...(deferBrowser ? ['--no-open'] : []),
  ];
  log(
    state.kind === 'stale'
      ? 'node_modules was reinstalled after the runtime started; restarting it once...'
      : state.kind === 'browser-locked'
        ? 'Managed browser failed on a stale profile lock; restarting the runtime once...'
        : 'Starting the IWSDK runtime with a headless managed browser...',
  );
  const result = iwsdk(args);
  if (result.status !== 0) {
    log(`iwsdk ${args.join(' ')} exited with code ${result.status}; will retry.`);
    return false;
  }
  if (deferBrowser) setUpBrowserInBackground();
  return true;
}

let browserSetupRunning = false;

function setUpBrowserInBackground() {
  if (browserSetupRunning) return;
  browserSetupRunning = true;
  log('Vite is serving; installing managed-browser dependencies in the background...');
  const setup = spawn(process.execPath, [path.join(root, 'scripts', 'setup-browser-deps.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  setup.on('close', () => {
    browserSetupRunning = false;
    if (stopping || isSuperseded()) return;
    // A runtime started with --no-open cannot enable its browser later
    // (`iwsdk dev open` is a no-op), so restart once with the browser on.
    // The preview port is already registered by now; this is a brief blip.
    log('Browser dependencies ready; restarting the runtime once with the managed browser...');
    const result = iwsdk(['dev', 'restart', '--headless']);
    if (result.status === 0) startTailAtEnd();
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.status < 500) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

function viteVersion() {
  return (
    readJson(path.join(root, 'node_modules', 'vite', 'package.json'))
      ?.version ?? ''
  );
}

function printReadyBanner(status) {
  const local = status?.runtimeUrls?.local ?? 'http://localhost:5173/';
  const network = status?.runtimeUrls?.network ?? [];
  const lines = [
    '',
    `  VITE v${viteVersion()}  ready in ${Date.now() - startedAt} ms`,
    '',
    `  ➜  Local:   ${local}`,
    ...network.map((url) => `  ➜  Network: ${url}`),
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

// --- Log streaming (new lines only) -----------------------------------------

function newestLog() {
  try {
    const files = fs
      .readdirSync(logsDir)
      .filter((name) => name.startsWith('dev-') && name.endsWith('.log'))
      .map((name) => path.join(logsDir, name));
    files.sort((a, b) => mtimeMs(b) - mtimeMs(a));
    return files[0] ?? null;
  } catch {
    return null;
  }
}

const tail = { file: null, offset: 0 };

function startTailAtEnd() {
  tail.file = newestLog();
  tail.offset = tail.file ? fs.statSync(tail.file).size : 0;
}

function pumpLog() {
  const file = newestLog();
  if (!file) return;
  if (file !== tail.file) {
    tail.file = file;
    tail.offset = 0;
  }
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return;
  }
  if (size < tail.offset) tail.offset = 0;
  if (size === tail.offset) return;
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(size - tail.offset);
    fs.readSync(fd, buffer, 0, buffer.length, tail.offset);
    process.stdout.write(buffer);
    tail.offset = size;
  } finally {
    fs.closeSync(fd);
  }
}

// --- Signals -----------------------------------------------------------------

let stopping = false;

process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  if (process.stdin.isTTY) {
    log('Stopping the IWSDK runtime...');
    iwsdk(['dev', 'down']);
  }
  process.exit(130);
});
for (const signal of ['SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    log(`Received ${signal}; detaching and leaving the runtime running.`);
    process.exit(0);
  });
}

// --- Main --------------------------------------------------------------------

claimSupervisor();
// Two launches can race; let the newest claim settle before touching the runtime.
await sleep(SUPERSEDE_SETTLE_MS);
exitIfSuperseded();

startTailAtEnd();
while (!ensureRuntime()) {
  await sleep(3000);
  exitIfSuperseded();
}

const status = readStatus();
const localUrl = status?.runtimeUrls?.local ?? 'http://localhost:5173/';
if (await waitForHttp(localUrl)) {
  printReadyBanner(status);
} else {
  log(`Runtime did not answer at ${localUrl} within ${READY_TIMEOUT_MS / 1000}s; still watching.`);
}

let polls = 0;
setInterval(() => {
  if (stopping) return;
  exitIfSuperseded();
  pumpLog();
  polls += 1;
  if (polls % HEALTH_EVERY_POLLS !== 0) return;
  if (!isAlive(readJson(sessionFile)?.pid ?? null) && runtimeState().kind === 'missing') {
    log('IWSDK runtime is not running; relaunching.');
    if (ensureRuntime()) startTailAtEnd();
  }
}, POLL_MS);
