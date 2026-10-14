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

// `predev` hook: makes sure IWSDK's managed headless Chromium (Playwright)
// can actually launch before the runtime tries to start it.
//
//   1. System libraries — on the Fedora-based v0 sandbox, install Chromium's
//      shared-library dependencies via dnf if they are missing.
//   2. Browser binary — verify Playwright's Chromium is fully installed and
//      runs. An interrupted download leaves a partial binary that segfaults
//      (SIGSEGV) on every launch; detect that and reinstall it.
//
// DEV-ONLY: the app and the production `dist/` build never launch Chromium.
// Idempotent and fast when everything is already in place (one `--version`
// probe). Never fails `npm run dev` — problems are reported, not thrown.

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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

ensureSystemLibraries();
ensureChromium();
process.exit(0);
