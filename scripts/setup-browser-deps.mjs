#!/usr/bin/env node
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

// Makes sure IWSDK's managed headless Chromium (Playwright) can launch.
// `scripts/dev.mjs` runs this in the background AFTER Vite is serving, then
// opens the managed browser — so a slow first-boot setup never delays the
// preview port (v0 gives up with "could not start server" if it waits too long).
//
//   1. System libraries — on the Fedora-based v0 sandbox, install Chromium's
//      shared-library dependencies via dnf if they are missing. These live
//      outside the persistent project disk, so every fresh VM needs them again.
//   2. Browser binary — verify Playwright's Chromium is fully installed and
//      runs. An interrupted download leaves a partial binary that segfaults
//      (SIGSEGV) on every launch; detect that and reinstall it.
//
// Browsers are kept in node_modules/.cache/ms-playwright instead of
// ~/.cache: the project directory survives VM replacement, the home directory
// does not, so the ~300 MB download happens once rather than on every new VM.
// node_modules is ignored by git and by Vite's watcher.
//
// DEV-ONLY: the app and the production `dist/` build never launch Chromium.
// Idempotent and fast when everything is already in place (one `--version`
// probe). Never fails `npm run dev` — problems are reported, not thrown.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const browsersPath = path.join(projectRoot, "node_modules", ".cache", "ms-playwright");
// Must be set before playwright-core is required; child processes (the IWSDK
// runtime that launches Chromium) inherit it from scripts/dev.mjs.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= browsersPath;

const require = createRequire(import.meta.url);

function has(cmd) {
  return (
    spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status ===
    0
  );
}

function warn(message) {
  console.warn(
    `[setup] ${message}\n` +
      "        This only affects IWSDK's managed browser tooling, not the app.",
  );
}

// --- 1. System libraries (Fedora sandbox only) -------------------------------

function librariesPresent() {
  // ldconfig cache is the cheapest way to check without launching Chromium.
  return (
    spawnSync("sh", ["-c", "ldconfig -p | grep -q libnspr4.so"], {
      stdio: "ignore",
    }).status === 0
  );
}

function ensureSystemLibraries() {
  if (process.platform !== "linux" || !has("dnf") || librariesPresent()) return;

  // Chromium's full runtime dependency set on Fedora.
  const packages = [
    "nspr",
    "nss",
    "atk",
    "at-spi2-atk",
    "at-spi2-core",
    "cups-libs",
    "libdrm",
    "libxkbcommon",
    "libXcomposite",
    "libXdamage",
    "libXext",
    "libXfixes",
    "libXrandr",
    "libXScrnSaver",
    "mesa-libgbm",
    "alsa-lib",
    "pango",
    "cairo",
    "gtk3",
  ];
  const sudo = has("sudo") ? "sudo -n " : "";
  // Keep the transaction light so it doesn't spike memory.
  const dnfFlags =
    "--setopt=install_weak_deps=False --nodocs --setopt=max_parallel_downloads=1";

  try {
    console.log("[setup] Installing managed-browser system libraries via dnf...");
    execSync(`${sudo}dnf install -y ${dnfFlags} ${packages.join(" ")}`, {
      stdio: "inherit",
    });
    console.log("[setup] Managed-browser system libraries installed.");
  } catch (err) {
    warn(
      `Could not install managed-browser system libraries: ${err?.message ?? err}`,
    );
  }
}

// --- 2. Playwright Chromium binary -------------------------------------------

function chromiumExecutablePath() {
  try {
    return require("playwright-core").chromium.executablePath();
  } catch {
    return null;
  }
}

// Playwright's browser folder (e.g. ~/.cache/ms-playwright/chromium-1234) sits
// one or two levels above the executable depending on platform; find the
// ancestor that holds the install markers.
function browserInstallDir(executable) {
  let dir = path.dirname(executable);
  for (let i = 0; i < 4; i += 1) {
    if (/^chromium-\d+$/.test(path.basename(dir))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function chromiumWorks(executable) {
  if (!executable || !fs.existsSync(executable)) return false;
  const installDir = browserInstallDir(executable);
  if (installDir && !fs.existsSync(path.join(installDir, "INSTALLATION_COMPLETE"))) {
    return false;
  }
  const probe = spawnSync(executable, ["--headless", "--no-sandbox", "--version"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: 30_000,
  });
  return probe.status === 0 && /Chrom/i.test(probe.stdout ?? "");
}

function installChromium() {
  const result = spawnSync("npx", ["--no", "playwright", "install", "chromium"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function ensureChromium() {
  const executable = chromiumExecutablePath();
  if (!executable) {
    warn("playwright-core is not installed; skipping the Chromium check.");
    return;
  }
  if (chromiumWorks(executable)) return;

  console.log(
    "[setup] Managed Chromium is missing or broken (likely an interrupted download); reinstalling...",
  );
  // Playwright skips folders that still carry INSTALLATION_COMPLETE, so remove
  // the broken install first to force a clean download.
  const installDir = browserInstallDir(executable);
  if (installDir) fs.rmSync(installDir, { recursive: true, force: true });

  if (installChromium() && chromiumWorks(executable)) {
    console.log("[setup] Managed Chromium reinstalled and verified.");
  } else {
    warn("Managed Chromium still fails to launch after reinstalling.");
  }
}

export function needsSetup() {
  // Playwright marks chromium complete before it finishes the headless shell,
  // so a running setup counts as unfinished regardless of the probe below.
  if (lockOwnerAlive()) return true;
  const missingLibraries =
    process.platform === "linux" && has("dnf") && !librariesPresent();
  const executable = chromiumExecutablePath();
  return missingLibraries || (executable != null && !chromiumWorks(executable));
}

// --- Single setup at a time ---------------------------------------------------
//
// v0 often launches a second `npm run dev` while the first one's setup is
// still running. Two concurrent dnf transactions or Playwright downloads into
// the same folder collide, so setups queue on a pid lock file. A lock whose
// owner is dead (killed with its supervisor) is taken over.

const lockFile = path.join(projectRoot, ".iwsdk", "runtime", "browser-setup.lock");
const LOCK_WAIT_MS = 10 * 60_000;

function lockOwnerAlive() {
  let pid;
  try {
    pid = Number(fs.readFileSync(lockFile, "utf8"));
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function acquireSetupLock() {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  let announced = false;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
      return;
    } catch {}
    if (!lockOwnerAlive()) {
      fs.rmSync(lockFile, { force: true });
      continue;
    }
    if (!announced) {
      console.log("[setup] Another browser setup is running; waiting for it...");
      announced = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  warn("Timed out waiting for another browser setup; continuing anyway.");
}

function releaseSetupLock() {
  try {
    if (Number(fs.readFileSync(lockFile, "utf8")) === process.pid) fs.rmSync(lockFile);
  } catch {}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await acquireSetupLock();
  process.on("exit", releaseSetupLock);
  ensureSystemLibraries();
  ensureChromium();
  process.exit(0);
}
