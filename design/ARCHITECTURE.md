# Sunny Circuit — Architecture

## Deviations from TECH_PLAN (found while grounding the build)

| Plan | Finding (installed rc.2 source) | Decision |
| --- | --- | --- |
| Kart as a physics body | `PhysicsSystem.update` only pushes object transforms to the engine for **grabbed** bodies, so a code-driven kinematic kart never reaches Havok; a Dynamic kart driven by `PhysicsManipulation` runs a worker frame behind the input | Kart motion + barrier response are a deterministic arcade integrator (`KartDriveSystem`): no tunnelling, no worker lag, steppable. Cones remain real Havok Dynamic bodies on a Static ground; the kart knocks them by writing `PhysicsManipulation.linearVelocity` |
| Lap gates as planes | Track is one closed centerline | Gates are centerline sample indices; a forward move of < N/4 samples that passes a gate index counts. Teleports/shortcuts move more than that and are ignored |
| Built-in grab for the wheel | Grab constraints are evaluated against a moving, yawing parent | Custom grip-angle steering in `KartInputSystem` (the TECH_PLAN fallback): squeeze within 35 cm of the hub, then the hand's angle around the hub turns the wheel; two hands average |
| Engine pitch on `AudioSource` | No playback-rate field | WebAudio synth (oscillators + noise) in `KartAudioSystem`; pitch is mirrored into `KartAudioState.enginePitch` for S8 |

## Modules

```
src/track.ts                 pure: centerline, samples, normals, gates, spawn, nearestSample()
src/race-components.ts       Kart, KartControls, RaceState, SteeringWheel, Ghost, Cone, KartAudioState, Dashboard
src/scene-assets/*.ts        track (ground, asphalt, curbs, barriers, start line, gantry, trees, sun), kart, ghost-kart, steering-wheel, cone
src/systems/kart-input.ts    p0  keys / gamepad / XR triggers + grip-angle wheel -> KartControls, wheel visual
src/systems/race.ts          p5  RaceState phase machine (idle -> countdown -> racing -> finished), restart
src/systems/kart-drive.ts    p10 arcade integrator, barrier collision, cone knock, trackIdx
src/systems/lap.ts           p12 gate crossing, lap/best/delta
src/systems/ghost.ts         p14 30 Hz record into preallocated Float32Arrays, replay best
src/systems/cockpit-rig.ts   p20 player rig parented to the kart seat, browser camera pose
src/systems/kart-audio.ts    p22 engine/squeal/thud/beeps synth
src/systems/dashboard.ts     p30 dashboard text at 10 Hz; race panel buttons
```

## Data flow

`KartControls` (input) -> `KartDriveSystem` writes kart `object3D` pose, `Kart.speed/slip/impact/trackIdx`
-> `LapSystem` writes `RaceState` -> Ghost / Audio / Dashboard read `Kart` + `RaceState`.
All race state lives in ECS components on the kart entity, so every success criterion can be asserted with `ecs` tools.

## Scene

`main.iwsdk.scene.json`: `track` (static asset), `ground-collider` (Static box), 10 `cone-*` (Dynamic),
`ghost`, and `kart` with children `steering-wheel`, `dashboard`, `race-panel`.
