#!/usr/bin/env node
// Direct public URL to the local Vite server that bypasses the v0 preview
// hostname. The v0 edge sometimes maps vm-*.vusercontent.net to a stopped
// sandbox (404 SANDBOX_NOT_FOUND) while this VM is healthy; a Cloudflare quick
// tunnel connects outbound from the VM, so it does not depend on that mapping.
//
// Idempotent: reuses a live tunnel, otherwise starts a detached one.
// The URL is unguessable but public — anyone holding it can load the dev server.
//
//   npm run tunnel          print (or create) the tunnel URL
//   npm run tunnel -- stop  stop the tunnel

import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { arch } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number.parseInt(process.env.PORT ?? '', 10) || 5173;
// node_modules/.cache lives on the persistent disk, so the binary survives VM replacement.
const binDir = join(root, 'node_modules', '.cache', 'cloudflared');
const bin = join(binDir, 'cloudflared');
const stateFile = '/tmp/iwsdk-tunnel.json';
const logFile = '/tmp/iwsdk-tunnel.log';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// /tmp survives VM replacement here, so a saved PID can belong to an unrelated
// process on the new VM. Only trust it if it is actually cloudflared.
function isTunnelProcess(pid) {
  if (!pid || !alive(pid)) return false;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('cloudflared');
  } catch {
    return false;
  }
}

async function responds(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

// Resolvers (the sandbox's and even 1.1.1.1) cache NXDOMAIN for a brand-new
// trycloudflare subdomain if it is queried before the record propagates, which
// makes a working tunnel look dead for minutes. Cloudflare's edge routes by
// SNI, so pin the request to the trycloudflare.com apex IP and skip the
// subdomain lookup: a live tunnel answers 200, a missing one 530.
async function publicResponds(url) {
  const { hostname } = new URL(url);
  let ip;
  try {
    ({ address: ip } = await lookup('trycloudflare.com', { family: 4 }));
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    const req = httpsRequest(
      { host: ip, servername: hostname, headers: { host: hostname }, path: '/', timeout: 10000 },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      },
    );
    req.once('timeout', () => req.destroy());
    req.once('error', () => resolve(false));
    req.end();
  });
}

async function ensureBinary() {
  if (existsSync(bin)) return;
  const asset = arch() === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
  console.log(`[tunnel] downloading ${asset}...`);
  const res = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`);
  if (!res.ok) throw new Error(`cloudflared download failed: HTTP ${res.status}`);
  mkdirSync(binDir, { recursive: true });
  writeFileSync(bin, Buffer.from(await res.arrayBuffer()));
  chmodSync(bin, 0o755);
}

function stop() {
  const state = readState();
  if (isTunnelProcess(state?.pid)) process.kill(state.pid, 'SIGTERM');
  rmSync(stateFile, { force: true });
}

async function start() {
  const existing = readState();
  if (isTunnelProcess(existing?.pid)) {
    // Retry transient edge errors before tearing down a tunnel that may be healthy.
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await publicResponds(existing.url)) return existing.url;
      await sleep(3000);
    }
  }
  stop();

  if (!(await responds(`http://127.0.0.1:${port}/`))) {
    throw new Error(`nothing is serving on port ${port}; run npm run dev first`);
  }

  await ensureBinary();
  const out = openSync(logFile, 'w');
  // QUIC (UDP 7844) is blocked in the sandbox; HTTP/2 over TCP 443 connects.
  const child = spawn(
    bin,
    ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`],
    { detached: true, stdio: ['ignore', out, out] },
  );
  child.unref();

  let url = null;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (!alive(child.pid)) throw new Error(`cloudflared exited; see ${logFile}`);
    const log = readFileSync(logFile, 'utf8');
    url ??= log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
    if (url && log.includes('Registered tunnel connection') && (await publicResponds(url))) {
      writeFileSync(stateFile, JSON.stringify({ pid: child.pid, url, port }));
      return url;
    }
  }
  process.kill(child.pid, 'SIGTERM');
  throw new Error(`tunnel did not come up within 60s; see ${logFile}`);
}

try {
  if (process.argv[2] === 'stop') {
    stop();
    console.log('[tunnel] stopped');
  } else {
    console.log(`[tunnel] ${await start()}`);
  }
} catch (error) {
  console.error(`[tunnel] ${error.message}`);
  process.exit(1);
}
