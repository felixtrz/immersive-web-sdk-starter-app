# Judging round-5

## Vehicle Art Director (anthropic/claude-opus-4.8): 6/10

A readable, cheerful orange low-poly kart with decent proportions, but flat materials, a bland driver and a messy cockpit view keep it merely functional rather than delightful.

- [high] The driver is a near-featureless dark blob torso with no helmet detail or limbs, very visible in orbit shots 10/11/12; it undermines the cockpit character and looks unfinished
  - Fix: Model a simple stylized driver: rounded helmet with a visor stripe, shoulders, and arms reaching to the wheel so the seat reads as occupied from both orbit and chase views
- [high] The first-person cockpit (01-04, 07) shows only a flat black dashboard slab with three grey dots and a barely-visible wheel rim; the steering wheel is mostly cropped/occluded and has no spokes or hub detail, making the primary VR view look empty
  - Fix: Raise and model the steering wheel with visible rim, 2-3 spokes, center hub and grips; add a simple molded dash with bezels around the indicator lights so the cockpit feels designed rather than a placeholder box
- [medium] All kart surfaces are uniformly flat-shaded with no material variation; the orange body, cream pods and grey chassis look like painted cardboard with no metallic/rubber contrast (orbit 10/11, chase 05)
  - Fix: Introduce light material differentiation: slightly glossy/metallic chassis rails, matte rubber tires, and a subtle bevel or edge highlight on the body panels to add readable low-poly form
- [medium] The cream/beige flat panels on top of the side pods (10/11) read as blank undetailed slabs and look like missing textures rather than intentional design
  - Fix: Add a simple decal, vent louvers, or a secondary accent stripe to the pod tops to break up the empty cream areas and tie them into the color scheme
- [low] The ghost kart is barely established as a distinct object; in 09 the second kart overlaps the player with no translucency or color cue visible, missing an opportunity for a distinct ghost material
  - Fix: Give the ghost a clearly translucent, desaturated or tinted material (e.g. cyan-blue glass) so it reads as a replay rather than a solid duplicate
- [low] Front and rear bumpers/nose are thin grey tube shapes (10/12) that look fragile and generic compared to the chunkier body
  - Fix: Thicken and round the bumper tubes slightly and color-match or accent them to the body so the nose and rear guard feel like intentional kart hardware

## Environment & Visual Cohesion Artist (google/gemini-3.1-pro-preview): 5/10

The environment functions as a basic low-poly track but feels overly barren, lacking the necessary lighting setup, ground details, and landmarks to fully realize the cheerful, toy-like art direction.

- [high] Trees and barriers around the track do not cast shadows on the ground (visible in 05-chase-racing.png and 06-chase-corner.png), causing the scenery to look flat and disconnected from the world.
  - Fix: Enable castShadow on all environment meshes (trees, track walls) and ensure the main directional light has an orthographic shadow camera that covers the track area.
- [high] The track asphalt and surrounding grass are completely uniform, solid colors (03-cockpit-racing.png), which removes visual reference points and severely diminishes the sense of speed.
  - Fix: Add high-frequency ground details such as alternating light/dark green stripes in the grass, baked ambient occlusion, subtle tire marks on the asphalt, or scattered 2D ground decals.
- [medium] The track composition is highly repetitive and barren, consisting only of identical scattered trees and generic block walls with no unique visual anchors (07-chase-ghost.png).
  - Fix: Break up the repetition by adding distinct landmarks like a starting line archway, colorful trackside sponsor boards, tire bundles at tight corners, or overhead banners.
- [medium] The grandstand geometry looks messy, featuring randomly intersecting, chaotic colored cubes that read as visual noise rather than a stylized crowd or seating area (10-kart-orbit-a.png).
  - Fix: Reorganize the grandstand with distinct, evenly spaced low-poly seats, and use simple peg-like character models for the audience to match the toy-like aesthetic.

## UX & HUD Usability Lead (openai/gpt-5.5): 8/10

The HUD and race flow are clear and mostly polished, but VR comfort and a few overlapping/obstructive UI choices keep it short of showcase-level usability.

- [medium] The persistent top-center 'Enter XR' button remains visible during racing and finish, while the idle panel also has an 'Enter VR' button; this creates duplicate terminology and unnecessary HUD clutter in screenshots 01-09.
  - Fix: Use one consistent label, preferably 'Enter VR', and hide or minimize the XR entry button once the race has started; expose it only from the idle/menu state or a pause/options UI.
- [medium] The lap-change notification is very large and centered directly over the vanishing point/road in screenshot 07, temporarily obscuring the most important driving area.
  - Fix: Move lap notifications to a smaller upper-center or lower-dashboard toast, shorten the display duration, and use a quick fade/slide animation so the road center is not covered while driving.
- [medium] The main HUD is positioned at the extreme upper-right in screenshots 02-07, which is fine on desktop but likely uncomfortable in seated VR because frequent speed/lap checks require looking toward the edge of the headset sweet spot.
  - Fix: For VR, place critical data on or just above the kart dashboard within the central 20-30 degrees of view, or provide a compact diegetic dashboard display with optional peripheral floating HUD.
- [low] The idle instructions panel in screenshots 01 and 10-12 is functional but dense, with small gray text and separator glyphs that read like black squares, reducing quick scanability.
  - Fix: Increase body text contrast and size slightly, split desktop and VR controls into two labeled groups, and replace separator squares with spacing or bullet points.
- [low] The finish overlay instruction in screenshots 08-09 is small and low in the panel hierarchy compared with the results, so the replay action is easy to miss.
  - Fix: Make the restart instruction a clearer button-style call to action, e.g. 'Race Again — R / A', with stronger contrast and spacing below the lap table.

## Gameplay & Game Feel Designer (anthropic/claude-sonnet-4.6): 7/10

Sunny Circuit delivers a complete, clean time-trial loop with solid HUD and ghost motivation, but is held back by a track that reads as nearly one-corner throughout, absent impact feedback, no off-track penalty, and a delta timer that never activates during the race.

- [high] DELTA column stays '---.--' for the entire race visible in screenshots 03-06 and only shows a best lap in the HUD strip after lap 1 completes; the delta vs ghost lap never renders a live +/- value, removing the primary second-by-second competitive tension of a time-trial.
  - Fix: Each frame compute signed delta = currentLapElapsed - ghostLapElapsedAtSameTrackProgress; display in green/red with a '+' or '-' prefix as soon as lap 2 begins. Use spline arc-length parameterisation already needed for the ghost to get matching progress.
- [high] Zero impact samples in telemetry and no visible feedback when hitting barriers or cones — screenshots show the automated driver staying on track with maxAbsLateralM of only 1.04 m, suggesting wall collisions either don't occur or produce no camera shake, sound cue, or speed scrub that would be perceptible to a player.
  - Fix: On any rigid-body collision above a velocity threshold apply: (1) a 2-4 frame camera shake scaled to impact speed, (2) a brief speed penalty/bounce impulse, and (3) a short audio sting. Even subtle cone-knock visual tipping feedback should be confirmed on screen.
- [high] Track layout visible across screenshots 03-06 appears to be a single wide sweeping curve with no meaningful variety — no tight hairpin, chicane, or elevation change is visible; lap times of lap 2 and 3 differ by only 0.003 s, indicating the automated driver found a trivially consistent groove with almost no challenge.
  - Fix: Add at least one slow-speed hairpin (forcing braking) and one chicane or esses section; these create braking zones that separate lap times and give the ghost comparison genuine meaning. A small elevation change would dramatically increase cockpit feel.
- [medium] No off-track / grass penalty is evident — the kart can drift onto the red-and-white kerbs (visible in screenshots 05-06) with no speed reduction, rumble feedback, or visual indicator; this removes a layer of skill expression and makes the racing line arbitrary.
  - Fix: Detect when the kart centre crosses outside the track spline boundary plus half-track-width; apply a grip/speed multiplier of ~0.6 on grass/gravel and optionally flash a 'OFF TRACK' HUD warning for 1 s.
- [medium] Lap complete notification (screenshot 07 'LAP 2 / 0:45.82') blocks approximately 25% of the forward view for what appears to be a fixed duration with no dismiss; in cockpit view this is especially intrusive at the precise moment the player is accelerating out of the start/finish straight.
  - Fix: Shrink the card to a banner at the top or bottom of the screen, reduce display time to ~1.5 s, and animate it sliding in/out rather than hard-appearing, so it doesn't obscure the racing line.
- [low] The finish screen (screenshots 08-09) prompts 'Press R (keyboard) or A (controller)' but gives no VR-headset equivalent action, even though 'Enter VR' is always visible; a VR player who has just finished sees no restart instruction they can act on.
  - Fix: Add 'or pull trigger' to the restart prompt text, consistent with the GO! screen wording already used at race start.
