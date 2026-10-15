# IWSDK project

A Vite + TypeScript or JavaScript app, but several things do **not** work the way
a normal Vite project works. Read this section before assuming anything.

Deeper material is installed in each selected harness's native path-scoped rule
format. Harnesses that use `AGENTS.md` also receive equivalent nested files near
the code they govern. Read the applicable scoped instructions before working in
that area.

## What is not standard Vite

**`iwsdk.config.json` is the project authority, not `vite.config.ts`.** It selects
the active scene, the asset module, the component module, and all XR/world
features. `vite.config.ts` only wires the plugin. Editing `iwsdk.config.json`
restarts Vite in place; the managed window remains open and its command bridges
reconnect automatically. Wait for `npx @iwsdk/cli dev status` to report
`browserCommandReady: true` before issuing browser-backed commands.

**`virtual:iwsdk-project` is a virtual module**, not a file. `src/index.ts` or
`src/index.js` imports it and passes it whole to `World.create()`. Do not
hand-build that options object.

**`npm run dev` is an idempotent supervisor, not Vite.** It runs
`scripts/dev.mjs`, which ensures one detached IWSDK runtime (Vite + a headless
managed browser hosting the MCP command bridge) is running, attaches to it,
prints Vite's ready banner and streams new runtime log lines. Running it again
attaches instead of restarting, and the newest supervisor replaces older ones
without touching the runtime. The runtime is only restarted when it is missing
or `node_modules` was reinstalled after it started. Every scene, ecs, ui, xr and
browser tool needs that managed browser; one managed window hosts two roles,
editor and runtime. Do not run `iwsdk dev restart --foreground` or a second
`dev up` by hand — check `npx @iwsdk/cli dev status` first.

**`src/assets.ts`/`src/assets.js` is evaluated twice, in two different JS
realms** — once by the app runtime, once by the editor. It must be deterministic
and side-effect free: no `World`, no DOM, no timers, no reliance on shared object
identity.

**Static geometry lives in TypeScript, composition lives in JSON.** Scene JSON
never declares URLs, geometry or materials — only manifest IDs.

**Components must be declared in a system-free module** and exported from
`src/components.ts`/`src/components.js` via `defineComponents()`. The editor
imports that same manifest to build its inspector, so a component that is not in
it cannot be authored in scenes.

**Import Three.js from `@iwsdk/core`, never from `three`.** `@iwsdk/core`
re-exports all of Three; importing `three` directly creates a duplicate instance
and subtle breakage. Exception: `import type { GLTF } from 'three/addons/...'`.

## Running inside v0

This repository is packaged as a template for [v0](https://v0.app/). A v0 chat
runs it in a Vercel Sandbox: a real Node.js VM with a framework-aware dev server,
a terminal, and Claude Code pre-installed. These platform deltas matter:

| Delta | Why |
| ----- | --- |
| `npm run dev` attaches, never force-restarts | v0 re-runs `npm run dev` after every `npm ci` and at the end of agent turns, often while an earlier run is alive. A foreground restart killed the managed browser each time. |
| Runtime is detached (`iwsdk dev up`) | It is not owned by any `npm run dev` process, so the platform killing one does not take Vite or the browser down. |
| Headless managed browser | The sandbox has no display. `vite.config.ts` forces `IWSDK_DEV_HEADLESS=1` when `DISPLAY` is unset; `npm run dev` passes `--headless` too. |
| `envDir: false` in `vite.config.ts` | v0 rewrites `.env.development.local` at the end of every turn; Vite restarts on env-file changes, which dropped the browser bridge. The app reads no `VITE_*` env vars — if you add some, define them in `vite.config.ts` instead. |
| Dev server serves plain HTTP | The sandbox proxy terminates TLS. `iwsdkDev({ https: false })` is the default here; set `IWSDK_DEV_HTTPS=1` for LAN headset testing. |
| `allowedHosts: true` | The preview is served through a generated sandbox hostname, not `localhost`. |
| Fallback tunnel URL (`scripts/tunnel.mjs`) | The v0 edge can keep `vm-*.vusercontent.net` mapped to a stopped sandbox (`404 SANDBOX_NOT_FOUND`) while this VM is healthy. In the sandbox, `npm run dev` keeps a Cloudflare quick tunnel up and logs `Fallback preview URL: …`; `npm run tunnel` prints it. The URL changes when the VM is replaced. Disable with `IWSDK_TUNNEL=0`. |

WebXR needs a secure context. `http://localhost` qualifies, and so does the
sandbox's HTTPS preview URL, so the IWER emulator works in the v0 preview. A real
headset on the LAN does not — deploy, or run `IWSDK_DEV_HTTPS=1 npm run dev`.

Before using any scene/ecs/ui/xr/browser tool in the sandbox, confirm the
runtime with `npx @iwsdk/cli dev status` (`running`, `browserConnected` and
`browserCommandReady` all `true`). If it is not running, `npm run dev` brings it
up; do not restart a healthy runtime. On a fresh VM, `npm run dev` serves Vite
first (`--no-open`) and runs `scripts/setup-browser-deps.mjs` in the background
— installing Chromium's system libraries and verifying/reinstalling Playwright's
Chromium — then opens the managed browser. Setup must never block the preview
port: v0 reports "could not start server" if the port does not open in time.
Playwright browsers live in `node_modules/.cache/ms-playwright` (persists across
VM replacement; `~/.cache` does not), so expect `browserConnected: false` for
the first minute or two after a VM boots.

`vercel.json` pins `framework: vite`, `outputDirectory: dist`, and an SPA rewrite.
Vercel checks the filesystem before rewrites, so files under `public/` still win
over `/index.html`. `base` is `'/'`, not upstream's `'./'`, because a relative
base breaks on deep URLs served through that rewrite.

## Traps that produce silent failures

| Trap                                                          | Symptom                                                                  | Fix                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `locomotion: true` with no `LocomotionEnvironment` on a floor | player falls through the world                                           | add the component to a walkable surface                                             |
| Scene origin left occupied                                    | player spawns inside your geometry                                       | the player origin is `0,0,0` unless the scene authors `player.transform`            |
| Scene JSON with `imports`                                     | authoring preview works, but editable open and runtime load are rejected | run `npx @iwsdk/cli scene flatten` once, then edit the flat output                       |
| `entity.destroy()`                                            | GPU memory leaked                                                        | use `entity.dispose()`                                                              |
| `setValue` on a Vec2/Vec3/Vec4/Color field                    | throws in elics 3.4.x                                                    | use `entity.getVectorView(...)`                                                     |
| Environment component on a non-root entity                    | silently ignored                                                         | `DomeGradient`/`IBLGradient` go on the level root only                              |
| Environment prop changed without `_needsUpdate`               | change ignored                                                           | set `_needsUpdate` after writing                                                    |
| `ScreenSpace` given numbers                                   | clamped with a console warning                                           | it takes CSS strings: `'400px'`, `'25vw'`                                           |
| `@iwsdk/reference` MCP tools in an old or `--no-install` app  | queries report warmup required                                           | run `npx @iwsdk/cli reference warmup`; fresh installed scaffolds do this during creation |

## Verify before you claim it works

**Always `npm run typecheck` before testing.** Type errors stop systems
initialising without necessarily logging anything in the browser.

Then check the right status for the task — these are not interchangeable:

- scene/editor work → `scene_get_state`
- XR device or session actions → `xr_get_session_status`
- server readiness → `npx @iwsdk/cli dev status` (XR availability is not a server signal)

When something is missing but the console is clean: call
`browser_get_console_logs` with only `count` (a `level` filter hides errors), then
`ecs_find_entities` to confirm the entity exists and carries the components you
expect.

The non-obvious part is which observation proves what: the **editor** render does
not run application systems, so anything driven by a system must be verified with
`browser_screenshot` (runtime), not `scene_screenshot` (editor).

## MCP and CLI are one surface, not two

Nearly every capability exists both ways — `scene_render_file` and
`npx @iwsdk/cli scene render-file`, `ecs_find_entities` and `npx @iwsdk/cli ecs find`.
Discover CLI actions with the bare domain or domain help (`npx @iwsdk/cli scene` or
`npx @iwsdk/cli scene --help`); both list that domain's actions.

**The CLI is not a fallback for a dead bridge.** Both routes drive the same
managed browser, so when `dev status` reports `browserConnected: false`,
every scene/ecs/xr/browser/ui command fails either way. Only `dev status`,
`dev logs` and `reference status` work without a browser.

Choose by the shape of the call, not by availability:

- **MCP** for one-off calls, and whenever you want the image returned inline.
- **CLI** when you need to loop or script — rendering six views, or sampling a
  value twice to measure a rate — or when the response is big enough to be worth
  filtering before it reaches context. A render of a scene containing an
  instanced pattern returns an id for every expanded instance.

CLI `--output-file` returns a **different payload shape** from the plain call:
the result nests under `data.result` instead of `data`, and `renderStats` and the
hashes are dropped. If you need a hash or triangle count, omit `--output-file`
and filter the JSON instead.

## Skills

Scene composition, UI authoring, physics, depth occlusion, grab and ray
interaction testing, ECS frame-stepping, and end-to-end planning each have a
project skill in the selected harness's standard skill directory. Their
descriptions handle routing, so they are not restated here.

The failure worth guarding against is improvising a domain that already has a
skill because the naive approach looks tractable. Before hand-authoring scene
JSON, a UIKitML panel, or a physics body, invoke the skill.

## Layout

```
iwsdk.config.json      project authority: scene, assets, components, world, dev
vercel.json            v0/Vercel build + routing for the static Vite output
src/index.ts|js        World.create() + explicit system registration
src/assets.ts|js       defineAssets() — shared runtime/editor catalog
src/components.ts|js   defineComponents() — shared runtime/editor catalog
src/scene-assets/      *.scene-asset.ts|js — parentless Object3D prototypes
public/scenes/         *.iwsdk.scene.json — composition only
public/ui/             *.uikitml — runtime-loaded panels
```

No barrel `index.ts` files. Keep component declarations free of system, DOM and
renderer imports; systems import the declarations, never the reverse.

## Conventions

- Systems use queries, never manually tracked entity arrays.
- Never allocate in `update()`. Allocate in `init()` as class properties.
- Prefer `queries.x.subscribe('qualify', ...)` over polling state each frame.
- Register every subscription teardown in `this.cleanupFuncs`.
- Use `signal.peek()` in `update()`; `.value` adds per-frame subscription overhead.
- Load assets through `AssetManager` / the manifest, never a raw `GLTFLoader`.
- Create entities with `world.createTransformEntity(...)`, never `scene.add()`.
- Use the `RayInteractable` component, never a manual `Raycaster`.
- VR targets 72–90 fps: 11–14 ms per frame. Treat per-frame allocation as a bug.

## Deep reference

Harness-native scoped rules cover `public/scenes/**`, `public/ui/**`,
`src/assets.ts`, `src/scene-assets/**`, and `src/**/*.ts`. `AGENTS.md`-based
harnesses receive nested instruction files; Cursor and Copilot receive their
native rule formats. Skill procedures live in the selected harness's project
skill directory and state when they apply.
