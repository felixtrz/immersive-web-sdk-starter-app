# Judging round-3

## Vehicle Art Director (anthropic/claude-opus-4.8): 6/10

A recognizable, cheerfully colored low-poly kart with a clean silhouette, but weak wheel/tire detail, a bland cockpit, and a problematic in-cockpit view hold it back from polish.

- [high] The driver's-seat cockpit view (01-04) is almost featureless: a flat black dashboard slab, three gray dots, and a barely-visible steering wheel rim with a single orange spoke that reads as a random bar rather than a wheel. This is the primary VR view and looks unfinished.
  - Fix: Model a proper readable steering wheel (full rim + 2-3 spokes + hub) sitting higher in frame, add stylized dashboard geometry (gauge cluster housing, grips) and a bit of the kart nose/front wheels in the lower periphery to ground the player in the cockpit.
- [high] Wheels and tires are very plain (10/11/12): flat black cylinders with a simple orange hub dot, no sidewall shaping, tread suggestion, or rim detail, which reads as rough even for low-poly.
  - Fix: Add a few chamfered loops to the tire silhouette, a distinct rim face (spokes or a disc with lug accents), and a subtle tread band so the wheels read as tires rather than black drums.
- [medium] The seat/driver is thin and ambiguous: the blue seat is a plain box and the driver (orbit 10/12, chase 05/07) is a featureless pale blob/sphere head with no body definition, undercutting the toy-like charm.
  - Fix: Sculpt a stylized bucket seat with side bolsters and give the driver a simple helmet (visor stripe) and shoulder/torso shape so the occupant reads cleanly from chase and orbit.
- [medium] Material treatment is flat matte across the whole kart (orbit shots) with no accent trim, decals, or specular pop beyond the frame rails, so the bodywork looks like untextured primitives.
  - Fix: Add stylized flat-color accent stripes/livery panels, a number roundel on the bodywork, and a slightly glossier material on the nose/sidepods to create visual hierarchy and readability.
- [low] The front nose/bumper is a very simple flat wedge (11/12) that is the least characterful part of the silhouette.
  - Fix: Give the nose a small stylized bumper lip or cone deflector and a subtle bevel to make the front end as interesting as the rear bumper bar.
- [low] Ghost kart is only glimpsed fleetingly and appears visually identical to the player kart (no distinct translucent/tinted treatment evident in provided shots).
  - Fix: Give the ghost a clearly translucent, desaturated or single-tint material so it reads instantly as a replay rather than a solid rival.

## Environment & Visual Cohesion Artist (google/gemini-3.1-pro-preview): 5/10

The bright low-poly aesthetic establishes a cheerful mood, but the absence of shadows and distinct landmarks leaves the environment feeling like a flat, monotonous prototype.

- [high] The scene lacks cast shadows entirely (e.g., 03-cockpit-racing), flattening depth perception (critical for VR) and making the 'sunny' environment feel strangely overcast with floating barriers.
  - Fix: Enable a shadow-casting directional light for dynamic objects, or bake shadows and ambient occlusion into the track and grass textures to ground the scenery.
- [high] The trackside scenery is extremely monotonous, featuring only randomly scattered trees without any landmarks, start/finish arches, or grandstands (02-cockpit-countdown).
  - Fix: Group trees into deliberate clusters to form distinct track sectors, and add low-poly props like tire stacks, a starting banner, and spectator tents to help players memorize the track.
- [medium] The track surface is mostly a flat gray with faint, oversized patches (07-chase-ghost), which provides too little visual feedback to convey a strong sense of speed near the camera.
  - Fix: Add smaller, high-contrast surface details such as baked skid marks through the corners, painted grid slots at the start, or a subtle asphalt noise pattern.
- [low] The sky is a completely empty gradient (04-cockpit-corner), missing an opportunity to reinforce the vibrant, cheerful art direction.
  - Fix: Add stylized, fluffy low-poly white clouds and a bright, visible sun to the skybox.

## UX & HUD Usability Lead (openai/gpt-5.5): 7/10

Clear and functional overall, with a readable main HUD and good race-complete panel, but several discoverability, state-communication, and VR-comfort issues keep it short of polished showcase quality.

- [medium] The instructions panel omits the C key for toggling chase camera, even though chase view is an advertised desktop control; screenshots 01, 08, and 10-12 list driving and restart controls only.
  - Fix: Add “C: toggle chase camera” to the instructions panel, ideally grouped with desktop controls, and keep the wording concise enough to avoid increasing panel size too much.
- [medium] Countdown/start state has conflicting feedback: screenshot 02 shows a central “2 / Get ready” countdown while the cockpit dash area already shows “Go!”, and the HUD timer appears to be running during countdown.
  - Fix: During countdown, suppress any “Go!” status text until the countdown completes and either pause the lap timer until race start or label the countdown separately so timing state is unambiguous.
- [medium] Cockpit dashboard/status text is clipped at the bottom edge in screenshots 01-04 and 08, with partial words like “Throttle to start,” “Go!,” and “Finished” visible; this looks accidental and is distracting.
  - Fix: Move cockpit status text upward onto a visible dashboard surface, shrink it, or remove it when the central HUD already communicates the same state; ensure all cockpit UI stays within the safe visible area at 16:9 and in VR.
- [medium] The HUD is anchored high and far right in screenshots 02-07, which is fine on desktop but may be uncomfortable in seated VR because important race data requires looking up/right rather than glancing naturally at the dash or near-center.
  - Fix: For immersive VR, use a world-space HUD attached to the kart dashboard or a gentle floating panel near the forward view, with key info like lap and speed within a comfortable 10-20 degree glance zone.
- [low] The finish screen shows two different time concepts at once: the center panel emphasizes total race time 5:02.40, while the top HUD still shows lap time 0:43.73 in screenshots 08-09, which can be misread as the final result.
  - Fix: On race complete, either hide the live racing HUD or switch it to a final-results mode where the top time label clearly says “Lap 3” or “Best lap,” while the total remains the primary result.
- [low] The persistent browser-style “Enter XR” button remains centered near the top throughout gameplay in screenshots 02-09, adding visual clutter close to the main HUD.
  - Fix: After the race starts on desktop, move the XR entry control into the instructions/menu panel or fade it unless the player opens a pause/menu state.

## Gameplay & Game Feel Designer (anthropic/claude-sonnet-4.6): 6/10

Sunny Circuit delivers a complete and readable time-trial loop with solid HUD and ghost motivation, but is held back by a flat, featureless track layout with no meaningful variety, zero perceptible impact/off-track feedback, an anomalous first-lap time suggesting a broken warm-up lap, and a cockpit view that conveys almost no sense of speed.

- [high] Lap 1 time is 3:10.13 vs lap 2 at 1:08.54 and lap 3 at 0:43.73 (finish screen, screenshot 08). A 3× anomaly on the opening lap almost certainly means the timer starts before the kart is allowed to move, or the countdown phase counts against lap time. This destroys the integrity of the time-trial loop for first-time players.
  - Fix: Start the lap timer only when the kart first crosses the start/finish line after the GO signal, not at countdown begin. Alternatively, mark lap 1 as an out-lap and begin official timing from lap 2, clearly labelled.
- [high] Zero impact samples recorded in telemetry despite traffic cones being a stated feature; no visible feedback event appears in any screenshot. Hitting a cone or barrier produces no screen shake, sound cue, speed penalty, or visual flash, making collisions feel invisible and removing consequence from the racing line.
  - Fix: On cone/barrier contact, trigger a brief (150 ms) camera shake, a visible on-screen flash tint (red, ~200 ms), and a 10–15% speed reduction lasting 0.5 s. Log impact events to telemetry so they are measurable.
- [high] Cockpit screenshots 03 and 04 show the track as an almost perfectly flat, straight, walled corridor with no elevation change, chicane, hairpin, or visual landmark distinguishing one section from another. The corner in screenshot 04 is barely perceptible from the cockpit view. At 82 km/h max speed the track offers no genuine challenge variation.
  - Fix: Add at least one tight hairpin (requiring braking), one fast sweeping bend with an apex curb cue, and one short elevation change. Introduce a visible landmark (e.g., a coloured banner arch or a distinctive barrier colour) at each sector boundary so the driver builds spatial memory.
- [medium] At 44 km/h (screenshot 03) and even 82 km/h (screenshot 07 cockpit), there is no speed sensation: no FOV breathing, no motion blur on peripheral barriers, no dashboard vibration, and the horizon line is static. The kart feels planted and slow regardless of actual speed.
  - Fix: Apply a subtle dynamic FOV increase (+5–8°) tied to speed, add a low-frequency camera bob at high speed, and optionally add a speed-lines particle effect on the periphery above 60 km/h.
- [medium] In screenshot 07 (cockpit ghost view) the ghost kart is not visible ahead on the straight even though lap 2 has just started and the ghost should be replaying lap 1 from the same position. The ghost may be present but indistinguishable, or its translucency renders it invisible against the tarmac.
  - Fix: Give the ghost a distinct emissive tint (e.g., cyan or white with 60% opacity) and ensure its silhouette is always visible above the road surface by raising it 0.05 m and adding a ghost-trail particle.
- [medium] There is no off-track detection or penalty visible in any screenshot or telemetry. The maxAbsLateralM of 1.24 m suggests the automated driver stayed on track, but a human who leaves the tarmac receives no feedback (no rumble, no slow-down, no visual warning).
  - Fix: Sample the kart's UV position against a track mask each frame; if off-track, apply a 30% grip reduction, display a flashing 'OFF TRACK' warning in the HUD, and restore full grip 1 s after returning to tarmac.
- [low] The delta column shows '0.00' with a grey indicator throughout laps 1 and 2 (screenshots 02–06) because no best lap exists yet, which is correct, but there is no explanatory label. New players may think the delta is broken.
  - Fix: Replace the grey '0.00' placeholder with dashes or the text 'NO REF' until a completed reference lap exists, matching the BEST column display style.
- [low] The instructions panel (screenshot 01) reappears at the finish screen (screenshots 08, 09) occupying the top-left corner alongside the results modal, creating visual clutter and redundancy since the player already knows the controls.
  - Fix: Hide the instructions panel once the race has started; show only the results modal and the Restart/Enter VR buttons at finish. Re-show instructions only after a full restart.
