# Sunny Circuit — Game Spec

**Pitch.** A low-poly kart time trial you drive from the seat. In VR you sit
in a cockpit, grab a steering wheel with both hands and squeeze the triggers
to drive; in a desktop browser the same kart drives from the keyboard or a
gamepad. Each run is a set of ~60-second laps around one sunny circuit,
racing a ghost of your own best lap.

**Pillars.**

- **The cockpit is the game.** Wheel, dashboard and kart body are always in
  view; they give VR comfort and they carry the HUD. Never trade them away.
- **Beat yourself.** One track, one clock, one ghost. Every system serves
  "was that lap faster?"
- **Arcade, not sim.** Forgiving grip, quick recovery from walls, no
  setup screens. Fun within 5 seconds of loading.

## Platform & Mode

- Session: dual — `ImmersiveVR` + browser fallback (`xr` offered, never required)
- Device target: Quest-class headset; desktop browser (Chrome/Edge/Safari) · Play space: seated
- Comfort: no speed cap and no vignette (user decision). The fixed cockpit
  frame (wheel, dash, kart body moving with the player) is the comfort
  reference. Camera is rigidly attached to the kart; no artificial head bob
  or camera shake in VR.

## Core Loop

Load in on the start grid, the lights count down, you drive. Every corner
you are judging braking points against the lap timer and the ghost kart
ahead or behind you. Crossing the line shows the lap time and delta to your
best; a new best replaces the ghost.

1. Countdown → 2. drive a lap (steer, throttle, brake, avoid walls) →
3. cross the line: lap time + delta, ghost updates on a new best → repeat.

## Mechanics

| #   | Mechanic          | Player verb                    | Notes                                                                                                 |
| --- | ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| M1  | Steering wheel    | grab + rotate (VR) / A-D, ←→, left stick | VR: wheel turns from the angle between the two grip points; works one-handed. Wheel visibly turns in browser too. |
| M2  | Throttle & brake  | trigger (VR) / W-S, ↑↓, gamepad triggers | VR: right trigger = throttle, left trigger = brake/reverse [ASSUMED]                            |
| M3  | Kart handling     | —                              | Arcade model: speed-sensitive steering, high grip, light drift; top speed ~25 m/s [ASSUMED]           |
| M4  | Physics collisions| hit walls/barriers             | Kart is a physics body; barriers and cones are colliders. Kart bounces off and keeps driving, no wrecks. |
| M5  | Lap timing        | cross start/finish line        | Checkpoints prevent cutting the course; 3-lap run [ASSUMED]; best lap kept for the session            |
| M6  | Best-lap ghost    | —                              | Records kart pose each frame; replays the best lap as a translucent kart. Session-only, no persistence |
| M7  | Engine & tire audio | —                            | Engine pitch follows speed/RPM; tire squeal on high lateral slip; impact thud on collisions            |
| M8  | Cockpit dashboard HUD | look down                  | Speed, current lap time, best lap, delta to best, lap counter, countdown lights                        |

## Space & Locomotion

- World size: one circuit, ~1 km lap (≈60 s at racing pace) on a ~300 × 200 m plot · Locomotion: none — the kart is the locomotion
- Built-in `locomotion` stays off; the player rig is parented to the kart.
- Collision geometry source: code-built track surface, barriers and cones (physics colliders)

## UI Surfaces

- Dashboard panel mounted in the cockpit (world-space, moves with the kart) — VR and browser.
- Start/results panel: "Start race" and post-run lap table, in the cockpit.
- Browser mode: same cockpit view from a fixed driver camera; no separate 2D HUD.

## Audio

- Engine loop (pitch/volume from RPM), tire squeal loop (volume from slip), collision thud, countdown beeps, lap-complete chime, new-best fanfare.

## Art Direction

- Low-poly, sunny, flat-shaded. Bright blue gradient sky, green grass, warm
  asphalt grey, red/white curbs, an orange kart. Code-built primitives for
  track, barriers, curbs, cones, trees and the kart; existing glTFs only if
  they fit.

## Scope

- **MVP:** drive a full 3-lap time trial on one circuit in VR and in the
  browser, with wheel steering, physics collisions, dashboard HUD, engine and
  tire audio, and a best-lap ghost (M1–M8).
- **Target:** results panel with per-lap splits, sector times on the dash, simple scenery (grandstand, trees, flags).
- **Stretch (non-goals for now):** AI opponents, multiplayer, multiple tracks, persistent leaderboards, kart customization, weather/night, haptics tuning.

## Success Criteria (asserted in Phase 6)

| #   | Criterion (observable)                                                                                 | How it will be checked                                      |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| S1  | Holding throttle for 2 s from the grid moves the kart forward > 10 m                                   | ecs snapshot/diff of kart transform                         |
| S2  | Grabbing the wheel in emulated VR and rotating it 90° changes the kart heading while moving            | xr grab + controller move, ecs diff of kart yaw             |
| S3  | Browser keys (W + A) drive and steer the kart without entering XR                                      | browser key input, ecs diff                                 |
| S4  | Driving into a barrier stops/deflects the kart; it does not pass through                               | ecs step across impact, kart position stays inside barrier line |
| S5  | Crossing start/finish after all checkpoints completes a lap; the dash shows the lap time and lap count increments | ECS lap state + runtime screenshot of dashboard   |
| S6  | Skipping a checkpoint does not count a lap                                                             | ECS lap state unchanged after shortcut crossing             |
| S7  | After a completed lap, a ghost kart entity exists and replays the recorded path on the next lap        | ecs find ghost entity, position diff over frames            |
| S8  | Engine audio pitch rises with speed                                                                    | ECS audio playbackRate at rest vs at speed                  |
| S9  | Browser console is free of errors during a full lap                                                    | browser_get_console_logs                                    |

## Decisions & Assumptions

| Decision          | Chosen                                      | Why                                                   | Source       |
| ----------------- | ------------------------------------------- | ----------------------------------------------------- | ------------ |
| Platform          | VR + browser                                | Playable on a headset and testable anywhere           | user         |
| Fantasy           | Cockpit kart racer                          | Cockpit gives VR comfort reference and hosts the HUD  | user         |
| VR steering       | Grab a virtual wheel                        | Most physical; reads instantly                        | user         |
| MVP race          | Time trial laps                             | No AI needed; tight scope                             | user         |
| Look              | Low-poly sunny circuit                      | Code-buildable, fast on Quest                         | user         |
| Lap length        | ~60 s                                       | Long enough for a varied layout                        | user         |
| Comfort           | No speed cap, no vignette                   | Cockpit provides the reference frame                  | user         |
| MVP extras        | Ghost, engine/tire audio, dash HUD, physics collisions | Chosen MVP feature set                    | user         |
| VR pedals         | Right trigger throttle, left trigger brake  | Matches common VR racers                              | [ASSUMED]    |
| Browser controls  | WASD / arrows + standard gamepad            | Universal defaults                                    | [ASSUMED]    |
| Run length        | 3 laps                                      | ~3 minute session                                     | [ASSUMED]    |
| Handling          | Arcade, top speed ~25 m/s                   | Pillar 3                                              | [ASSUMED]    |
| Best lap storage  | Session only (memory)                       | No backend needed for MVP                             | [ASSUMED]    |
