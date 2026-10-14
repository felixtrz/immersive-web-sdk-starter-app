# Sunny Circuit — Tech Plan

Grounded against the installed `@iwsdk/core` **1.0.0-rc.2** (`node_modules/@iwsdk/core/dist/**/*.d.ts`,
ladder rung 3) and the `@iwsdk/cli reference` corpus (ready). Signatures quoted below were read from
the installed `.d.ts`, not from docs.

## iwsdk.config.json world block (decided)

Merge into the existing `world` block; keep the existing scene/asset/component module entries.

```jsonc
{
  "world": {
    "xr": { "mode": "vr", "offer": "always" },   // VR offered, browser play never blocked
    "features": {
      "physics": true,      // kart body + barrier/cone colliders
      "grabbing": true,     // steering wheel (spike, see M1)
      "spatialUI": true,    // dashboard + start/results panel (UIKitML)
      "locomotion": false   // the kart is the locomotion; player rig parented to the kart
    }
  }
}
```

Prerequisite checks:
- `locomotion: false` → no `LocomotionEnvironment` needed; the "player falls through world" trap does not apply.
- Player origin must not be `0,0,0` inside geometry: the rig is re-parented to the kart's seat at spawn `(-14, 0, 108)`.
- `spatialUI` → dashboard `.uikitml` registered in `src/assets.ts` as `AssetType.UIKitML`.
- `DomeGradient` / `IBLGradient` go on the **level root** only.

## Mechanics grounding

| Mechanic | Class | IWSDK pieces (verified) | Custom work | Risk |
| --- | --- | --- | --- | --- |
| M1 Steering wheel | BUILT-IN spike → CUSTOM fallback | `OneHandGrabbable { translate: false, rotate: true, rotateMin/rotateMax: Vec3 }` (per-axis limits, the d.ts example is "rotation-only on Y axis"); `TwoHandsGrabbable` has the same fields plus scale | `KartInputSystem` reads the wheel's local roll each frame → `steer ∈ [-1, 1]`, then re-centres the wheel when released. **Fallback:** `WheelGrabSystem` computes the angle from both controller grip poses (`world.input.xr`) while squeeze is held | Grab constraints may be evaluated in world space while the wheel's parent (the kart) moves and yaws. Spike in M1 before building on it |
| M2 Throttle & brake | CUSTOM (thin) | `world.input.keyboard.getKeyPressed(code)`; `world.input.browserGamepads[i]` (`StatefulBrowserGamepad`); `world.input.xr` gamepads for triggers | Map keys/triggers/stick to `KartControls { throttle, brake, steer }` | XR trigger accessor names are in `@iwsdk/xr-input/gamepad`; confirm in M1 |
| M3 Kart handling | CUSTOM | `PhysicsBody { state: Dynamic, linearDamping, angularDamping }`, `PhysicsShape { shape: Box, dimensions, friction, restitution }`; `PhysicsManipulation { linearVelocity, angularVelocity }`, a one-shot component that "is automatically removed after the manipulations are applied" | `KartDriveSystem`: arcade model computes the target planar velocity and yaw rate from controls and speed, then writes them via `PhysicsManipulation` each physics tick | Physics runs in a worker with interpolation (`useWorker`, `interpolation` config). If velocity control feels laggy, set `useWorker: false` for this app |
| M4 Physics collisions | BUILT-IN | Barrier segments + cones: `PhysicsBody { state: Static }` + `PhysicsShape { shape: Box }`. Kart is Dynamic, so walls deflect it natively | Impact detection for the thud: **there are no contact events in the API** (grep of physics d.ts finds none), so detect a sudden drop in speed in `KartAudioSystem` | Thin barriers tunnelling at 25 m/s. Use 1 m thick boxes; cap speed at 25 m/s |
| M5 Lap timing | CUSTOM | — (no trigger volumes in the physics API) | `LapSystem`: four gate planes (CP0..CP3) as data; segment-crosses-plane test on the kart's position each frame; ordered progress; writes signals | Kart crossing a gate backwards. Count only forward crossings (dot with gate normal) |
| M6 Best-lap ghost | CUSTOM | `world.createTransformEntity(ghostMesh)`, translucent `MeshStandardMaterial` | `GhostSystem`: record pose at a fixed 30 Hz into a **preallocated** `Float32Array` (120 s × 30 Hz × 7 floats ≈ 100 KB); swap buffers on a new best; replay by lap-time interpolation | Per-frame allocation. Preallocate all buffers in `init()` |
| M7 Engine & tire audio | BUILT-IN + CUSTOM | `AudioSource { src, loop, autoplay, positional, volume }`; `AudioUtils.play/stop/setVolume`, `AudioUtils.createOneShot(world, src)` | **No pitch/playbackRate field on `AudioSource`.** `KartAudioSystem` drives the engine pitch by reaching the underlying three `Audio` node (`setPlaybackRate`); fallback is our own `AudioBufferSourceNode` on the world's `AudioListener` context | Underlying audio object not exposed. Resolve in M5; mirror the value into `KartAudioState.enginePitch` so S8 can assert on ECS data |
| M8 Dashboard HUD | BUILT-IN | `spatialUI` flag, `PanelUI` + `PanelDocument` (`UIKitDocument`), UIKitML asset; panel entity parented to the kart | `DashboardSystem` subscribes to the race signals and writes text by element ID (no per-frame string allocation; throttle the speed text to 10 Hz) | Text legibility at 0.55 m. Size fonts for Quest |
| Sky, light | BUILT-IN | `DomeGradient`, `IBLGradient` on the level root; `DirectionalLightComponent`, `HemisphereLightComponent` | — | — |
| Track geometry | CUSTOM (code-built asset) | `src/scene-assets/*.scene-asset.ts` (parentless Object3D prototypes), manifest IDs only in scene JSON | `track.scene-asset.ts` builds the asphalt ribbon, curbs and grass from the centerline spline; `barrier` and `cone` prototypes instanced along it | Draw calls. Merge the ribbon into one mesh; instance the barriers visually, while colliders stay as separate static boxes |

Reinvention audit (`api-reference.md` table): no custom raycasting, grab, sky, teleport or spatial audio.
The two genuinely custom areas are the steering angle (only if the grab spike fails) and engine pitch,
both forced by gaps in the installed API.

## Custom systems

Priority bands: 0–9 input · 10–19 sim · 20–29 visual sync · 30+ UI.

### KartInputSystem (priority 2 — input)
- Queries: `{ kart: { required: [KartControls, Kart] }, wheel: { required: [SteeringWheel] } }`
- Reacts to: frame
- Writes: `KartControls.throttle/brake/steer`
- Sketch: keyboard (`KeyW/KeyS/KeyA/KeyD`, arrows) → gamepad axes/triggers → XR triggers; steer comes from the wheel's local roll (grabbed) or keys (browser), and when there's no grab the visual wheel animates toward `steer × 90°`.

### KartDriveSystem (priority 12 — sim)
- Queries: `{ kart: { required: [Kart, KartControls, PhysicsBody] } }`
- Reacts to: frame (only while `race.phase` is `racing`)
- Writes: `PhysicsManipulation { linearVelocity, angularVelocity }`, `Kart.speed`, `Kart.slip`
- Sketch: forward speed integrates throttle/brake with drag and caps at 25 m/s; yaw rate = `steer × maxYaw × f(speed)`; lateral velocity bleeds toward zero (grip) with a slip term; reuses scratch `Vector3`s.

### LapSystem (priority 14 — sim)
- Queries: `{ kart: { required: [Kart] } }`
- Reacts to: frame
- Writes: signals `race.phase`, `race.lap`, `race.lapTime`, `race.bestLap`, `race.delta`, `race.nextCheckpoint`
- Sketch: countdown (3 s) → racing; a forward crossing of the next gate advances progress, and crossing CP0 with progress = 3 completes the lap; after 3 laps → `finished`.

### GhostSystem (priority 16 — sim)
- Queries: `{ kart: { required: [Kart] }, ghost: { required: [Ghost] } }`
- Reacts to: frame + `race.lap` signal
- Writes: ghost `Transform`; swaps the record/best buffers on a new best
- Sketch: the ghost is hidden until a best exists; position/quaternion are lerped from the best buffer at the current lap time.

### CockpitRigSystem (priority 20 — visual sync)
- Queries: `{ kart: { required: [Kart] } }`
- Reacts to: `qualify` (once), XR session start
- Writes: parents `world.player` to the kart seat; browser mode puts the camera at eye `(0, 0.95, 0)` kart-local

### KartAudioSystem (priority 22 — visual sync)
- Queries: `{ kart: { required: [Kart, KartAudioState] } }`
- Writes: `KartAudioState.enginePitch/squealGain`, the underlying audio playback rate, impact one-shots

### DashboardSystem (priority 30 — UI)
- Queries: `{ dash: { required: [PanelUI, Dashboard] } }`
- Reacts to: race signals (subscribe; teardown in `cleanupFuncs`)
- Writes: element text by ID: `speed`, `lap`, `time`, `best`, `delta`, `light-1..5`, `start-button`

## Custom components (declared system-free, exported via `defineComponents()`)

| Component | Fields (Type, default) | On which entities |
| --- | --- | --- |
| `Kart` | `speed: Float32 0`, `slip: Float32 0`, `maxSpeed: Float32 25` | player kart |
| `KartControls` | `throttle: Float32 0`, `brake: Float32 0`, `steer: Float32 0` | player kart |
| `SteeringWheel` | `maxAngle: Float32 1.57`, `angle: Float32 0` | wheel entity (child of kart) |
| `Checkpoint` | `index: Int8 0`, `width: Float32 14` | 4 gate entities (also placeable in the editor) |
| `Ghost` | tag | ghost kart |
| `KartAudioState` | `enginePitch: Float32 1`, `squealGain: Float32 0` | player kart |
| `Dashboard` | tag | dashboard panel |

## Asset manifest

| Asset | Type | Source | Path |
| --- | --- | --- | --- |
| track (asphalt, curbs, grass) | scene asset | code-built from centerline | `src/scene-assets/track.scene-asset.ts` |
| barrier segment | scene asset | code-built box, low-poly tyre stack | `src/scene-assets/barrier.scene-asset.ts` |
| cone | scene asset | code-built cone | `src/scene-assets/cone.scene-asset.ts` |
| kart (body, seat, wheels) | scene asset | code-built primitives | `src/scene-assets/kart.scene-asset.ts` |
| steering wheel | scene asset | code-built torus + spokes | `src/scene-assets/steering-wheel.scene-asset.ts` |
| start gantry + lights | scene asset | code-built | `src/scene-assets/gantry.scene-asset.ts` |
| tree | scene asset | code-built (target tier) | `src/scene-assets/tree.scene-asset.ts` |
| dashboard panel | UIKitML | authored | `public/ui/dashboard.uikitml` |
| start/results panel | UIKitML | authored | `public/ui/race-panel.uikitml` |
| engine loop, squeal loop, thud, beeps, chime, fanfare | audio | to source (CC0) or synthesize with WebAudio | `public/audio/*.ogg` |

Track centerline (meters, y = 0), from `design/concept/layout.svg`:
`(-81,108) (81,108) (148,81) (169,27) (148,-27) (81,-40) (40,-81) (54,-121) (0,-135) (-81,-121) (-148,-81) (-175,-13) (-162,54) (-135,94)`,
closed, Catmull-Rom smoothed, 10 m wide. Gates: CP0 `(0,108)`, CP1 `(169,27)`, CP2 `(0,-135)`, CP3 `(-175,-13)`.

## Globals & signals (`world.globals`)

| Key | Type | Writers | Readers |
| --- | --- | --- | --- |
| `race.phase` | `'idle' \| 'countdown' \| 'racing' \| 'finished'` | LapSystem, race panel | all sim systems, Dashboard |
| `race.lap` | number (1..3) | LapSystem | Dashboard, GhostSystem |
| `race.lapTime` | number (s) | LapSystem | Dashboard, GhostSystem |
| `race.bestLap` | number \| null | LapSystem | Dashboard, GhostSystem |
| `race.delta` | number (s) | LapSystem | Dashboard |
| `race.countdown` | number (0..5 lights) | LapSystem | Dashboard, KartAudio |

## Risks & mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Built-in grab misbehaves on a moving, yawing parent | M1 wheel unusable in VR | M1 spike: grab the wheel in emulated XR while the kart drives. If it fails, switch to the custom two-grip-angle `WheelGrabSystem` (input band, no engine changes) |
| Velocity control through a worker-interpolated physics body feels laggy | Handling feels mushy | Try `PhysicsSystem` config `useWorker: false` and `updateFrequency` 90; tune damping |
| No playback-rate field on `AudioSource` | S8 engine pitch | Mirror the pitch into `KartAudioState`; drive the underlying node or a WebAudio fallback |
| No contact/trigger events | Lap gates + impact sounds | Plane-crossing gates (deterministic, cheap); speed-drop impact detection |
| Barrier tunnelling at speed | Kart leaves the track (S4) | 1 m thick boxes, speed cap, verify with ecs pause/step across impact |
| No audio files in the repo | M7 blocked on assets | Synthesize the engine/squeal with WebAudio oscillators + noise for MVP; swap in CC0 files later |
| Headless managed browser has no real XR device | VR criteria (S2) | Use the IWER emulator through the xr tools (`xr enter`, controller grab/move), as the grab/ray skills describe |
