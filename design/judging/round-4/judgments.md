# Judging round-4

## Vehicle Art Director (anthropic/claude-opus-4.8): 7/10

A charming, readable low-poly go-kart with good proportions and a cheerful orange livery, but several areas (the driver figure, the cockpit's empty seat, and some finicky detail parts) keep it from showcase polish.

- [medium] The cockpit view from the driver's seat is dominated by a flat black dashboard slab with three plain dark circles and a barely-visible wheel rim; the green trigger-indicator blobs look like placeholder UI pasted onto the dash rather than modeled gauges (02-cockpit-countdown, 03-cockpit-racing, 01-cockpit-idle)
  - Fix: Model a proper stylized dash: replace the flat circles with low-poly dials/bezels, give the steering wheel a visible rim and spokes in the cockpit view, and integrate the throttle/brake feedback as actual lit gauge elements rather than floating green ovals
- [medium] The driver figure is inconsistent and reads poorly: in orbit (10-kart-orbit-a) the seat looks nearly empty with only a vague dark torso, while in chase (07-chase-ghost) a full helmeted driver appears, suggesting the body mesh is thin/missing from some angles
  - Fix: Ensure the driver mesh is a solid, consistent low-poly figure with torso, arms reaching the wheel, and legs visible from all angles; fill the seat so orbit views don't look vacant
- [low] The rear/underside detail parts (exhaust pipe, silver floor pan, rear bumper rails) look thin and slightly scattered, reading as loose sticks rather than cohesive structure in chase and finish shots (09-chase-finished, 05-chase-racing)
  - Fix: Thicken and group the rear bumper/exhaust/floor geometry into a tidier chamfered assembly so the back of the kart reads as deliberate rather than stray edges
- [low] The ghost kart appears to use the identical opaque material/colors as the player kart in the distance (07-chase-ghost shows a teal-tinted kart top-right), making player vs ghost distinction rely entirely on faint translucency
  - Fix: Give the ghost a clearly distinct translucent/tinted material (e.g. uniform ghostly cyan with fresnel edge glow) so it reads unmistakably as a replay rather than a second solid kart
- [low] The seat and body surfaces are flat matte with no edge highlights or material variation, making the orange body panels look slightly plasticky and undetailed for a hero vehicle (10-kart-orbit-a)
  - Fix: Add subtle beveled edges, a light decal/number plate on the sidepods, and a hint of specular/trim contrast to give the bodywork more toy-like richness

## Environment & Visual Cohesion Artist (google/gemini-3.1-pro-preview): 6/10

The environment establishes a clean and readable baseline, but flat lighting and primitive scenery assets hold back the intended sunny, toy-like charm.

- [high] The environment lacks directional cast shadows from trees, walls, and structures (visible in 05, 06), resulting in a flat, unlit appearance that completely contradicts the 'sunny' theme.
  - Fix: Add a primary directional sun light with shadow mapping enabled so that static objects cast clear, stylized low-poly shadows onto the track and grass.
- [medium] The grandstand (10-kart-orbit-a) appears as a primitive block-out of stacked, heavily saturated primary-colored cubes that lack structural logic and clash with the rest of the scenery.
  - Fix: Replace the cube stack with a cohesive low-poly grandstand model featuring defined seating rows, support structures, and a unified, slightly pastel color scheme.
- [medium] The track surface contains bizarre, blocky dark gray rectangular patches (04-cockpit-corner, 05-chase-racing) and the surrounding grass is a completely featureless flat plane, making the world feel empty and reducing the sense of speed.
  - Fix: Correct the geometry or texture mapping on the road to remove the dark patches, add a subtle scrolling grain to the asphalt, and scatter low-poly props (rocks, bushes, flowers) across the grass to provide visual speed references.
- [low] The exact same tree model is stamped repeatedly across the landscape without any variation in size or rotation (06-chase-corner).
  - Fix: Randomize the scale (e.g., +/- 20%) and Y-axis rotation of the placed trees, and introduce at least one additional foliage variant to break up the repetition.

## UX & HUD Usability Lead (openai/gpt-5.5): 8/10

A clear, functional racing HUD with good hierarchy, but the central start overlays and VR comfort/actionability issues keep it short of showcase polish.

- [medium] The large centered READY/GO overlay blocks the driving line and persists into active driving, especially in 02-03 where it covers the road during launch.
  - Fix: Shrink the GO card, move it slightly above the horizon or make it non-card text only, and fade it out within roughly 0.3-0.5 seconds after control begins.
- [medium] The main race HUD is high and far to the upper-right in cockpit view, which is readable on desktop but likely uncomfortable in seated VR because key info requires looking away from the road, as seen in 03-04.
  - Fix: Add a VR-friendly diegetic or world-locked dashboard near the steering wheel/low center for speed, lap, and time, with the upper HUD minimized or optional in VR.
- [medium] Finish state restart guidance is desktop-biased: 08-09 say 'Press R or Restart' but no visible Restart button is present on the finish card and no VR restart action is explained.
  - Fix: Put a large Restart button directly on the finish panel and add a VR-specific prompt such as 'Pull trigger to restart' or support gaze/ray selection.
- [low] The instructions panel is useful but slightly dense and awkwardly formatted in 01 and 10, with small text, square separators, and unclear arrow-key phrasing such as 'A D / Left Right'.
  - Fix: Convert controls into a two-column icon list with keyboard keycaps and VR trigger/wheel icons, using larger spacing and clearer labels like 'A/D or ←/→: steer'.
- [low] The persistent 'Enter XR' browser-style button remains visible during racing and finish screens in 02-09, competing with the HUD near the top center.
  - Fix: Hide or collapse the Enter XR affordance once the race starts, or move it into a pause/menu state so the racing HUD has visual priority.

## Gameplay & Game Feel Designer (anthropic/claude-sonnet-4.6): 6/10

Sunny Circuit delivers a complete and readable time-trial loop with a working ghost and dual cameras, but is held back by a visually monotonous track layout, near-zero sense of speed in cockpit view, absent impact/off-track feedback, and a delta timer that never activates during the race.

- [high] DELTA column reads '---.--' for all three laps (screenshots 02-08); the delta against best lap is never populated during the race, gutting the core time-trial feedback loop that motivates ghost chasing
  - Fix: Compute sector or per-frame delta vs. the stored best-lap ghost timestamps and display '+0.00' / '-0.00' with red/green colouring from the moment lap 2 begins; ensure the value resets to 0.00 at each lap crossing rather than staying blank
- [high] Sense of speed in cockpit view is very low; screenshots 03-04 at 41-62 km/h feel static—no FOV pulse, no camera shake, no road blur, and the horizon barely moves despite the kart doing 82 km/h max (telemetry)
  - Fix: Add a subtle dynamic FOV increase (e.g. 70°→80° mapped to 0-82 km/h), a very slight high-frequency vertical camera bob tied to speed, and optionally a speed-lines vignette at the screen edge above 70 km/h to sell velocity in the seated cockpit perspective
- [high] Zero impact feedback: telemetry shows 0 impact samples and the traffic-cone interaction advertised in the brief produces no camera jolt, sound cue, or screen flash visible in any screenshot; hitting barriers also appears silent and consequence-free
  - Fix: On cone or barrier collision above a threshold impulse, trigger a 150ms camera shake (random offset ±0.03 m), a brief red vignette flash, and a short bump sound; for barrier contacts add a small velocity damping so the player feels the wall
- [medium] Track layout appears to be almost entirely wide straights and gentle symmetric bends (screenshots 03-06 show identical barrier-lined corridors); there is no visible hairpin, chicane, or mixed-radius section to create pacing variety or a memorable racing line challenge
  - Fix: Introduce at least one tight hairpin (requiring genuine braking) and one double-apex or chicane sequence so lap rhythm alternates between full-throttle and technical sections; even at this scope a single hairpin raises replayability significantly
- [medium] No off-track detection or consequence: the wide flat run-off areas visible in screenshots 05-06 mean a player can cut corners or go off-track with no speed penalty, warning message, or position reset, removing a layer of challenge and track-limit strategy
  - Fix: Detect when the kart centre leaves the tarmac polygon, immediately apply a 30-40% speed cap and display a brief 'Off track' warning on the HUD; optionally revert the lap time for that sector if a shortcut is detected
- [low] The 'Race complete' screen (screenshots 08-09) has a 'Press R or Restart' prompt but no visible on-screen Restart button for VR users who cannot press R on a keyboard; the in-race UI also lacks a minimap so players cannot preview upcoming corners
  - Fix: Add a world-space 'Restart' button or controller-ray-interactable panel visible in VR at the finish screen; add a small corner-dot minimap overlay (even a static SVG path) to the HUD so players can anticipate the next turn type
