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

// `npm run dev` entry point. The v0 sandbox re-runs this script at the end of
// every agent turn, often while the previous run is still alive. Calling
// `iwsdk dev restart` here would kill the healthy managed browser each time,
// so instead this script:
//   1. attaches to a runtime that is already running, or starts one detached
//      (`iwsdk dev up`) so it survives this npm process being killed;
//   2. stays in the foreground, streaming the runtime log so the platform
//      still sees output and a live process;
//   3. relaunches the runtime if it ever exits.
// Ctrl+C in an interactive terminal stops the runtime (`iwsdk dev down`);
// platform signals (SIGTERM/SIGHUP) only detach and leave it running.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runtimeDir = path.join(root, '.iwsdk', 'runtime');
const sessionFile = path.join(runtimeDir, 'session.json');
const logsDir = path.join(runtimeDir, 'logs');
const isWindows = process.platform === 'win32';
const POLL_MS = 1000;
const HEALTH_EVERY_POLLS = 5;

function iwsdk(args, capture = false) {
  return spawnSync('iwsdk', args, {
    cwd: root,
    shell: isWindows,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
}

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function readSessionPid() {
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    return typeof session.pid === 'number' ? session.pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function runtimeIsRunning() {
  const result = iwsdk(['dev', 'status'], true);
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed?.data?.state?.running === true && isAlive(readSessionPid());
  } catch {
    return false;
  }
}

function ensureRuntime() {
  if (runtimeIsRunning()) {
    log('Attached to the running IWSDK runtime (managed browser left untouched).');
    return true;
  }
  log('Starting the IWSDK runtime with a headless managed browser...');
  const result = iwsdk(['dev', 'up', '--headless']);
  if (result.status !== 0) {
    log(`iwsdk dev up exited with code ${result.status}; will retry.`);
    return false;
  }
  return true;
}

function newestLog() {
  try {
    const files = fs
      .readdirSync(logsDir)
      .filter((name) => name.startsWith('dev-') && name.endsWith('.log'))
      .map((name) => path.join(logsDir, name));
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

const tail = { file: null, offset: 0 };

function pumpLog() {
  const file = newestLog();
  if (!file) return;
  if (file !== tail.file) {
    const isFirstFile = tail.file === null;
    tail.file = file;
    tail.offset = isFirstFile ? Math.max(0, fs.statSync(file).size - 4096) : 0;
  }
  const size = fs.statSync(file).size;
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

ensureRuntime();

let polls = 0;
setInterval(() => {
  if (stopping) return;
  pumpLog();
  polls += 1;
  if (polls % HEALTH_EVERY_POLLS !== 0) return;
  if (!isAlive(readSessionPid()) && !runtimeIsRunning()) {
    log('IWSDK runtime is not running; relaunching.');
    ensureRuntime();
  }
}, POLL_MS);
