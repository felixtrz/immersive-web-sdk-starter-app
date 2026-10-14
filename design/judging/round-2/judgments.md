# Judging round-2

## Vehicle Art Director (anthropic/claude-opus-4.8): 6/10

A readable, cheerful orange go-kart with correct basic silhouette, but blocky undetailed bodywork, a floating steering column, and a dull flat seat keep it in plain-but-functional territory.

- [high] The steering column/wheel floats on a thin stick disconnected from any dashboard or nose, with no linkage to the front axle, looking unfinished in orbit shots 10, 11 and 12
  - Fix: Add a steering column housing or small dash/nacelle that visually connects the wheel to the chassis, and anchor the base into the floor pan
- [medium] Bodywork is almost entirely undetailed slab boxes with no sidepods, nose cone, floor pan edges, or bumpers distinguished; the front just tapers to a flat wedge (11, 12) making it read as a toy block rather than a kart
  - Fix: Model a distinct front nose/bumper, rear bumper, and low side pods as separate low-poly volumes to break up the monolithic orange mass
- [medium] The driver seat is a flat gray slab with no bucket shape, headrest, or seams, and there is no driver figure, leaving the cockpit looking empty in orbit and chase (07, 10, 11)
  - Fix: Reshape the seat into a bucket with side bolsters and a backrest curve, and optionally add a simple low-poly driver or helmet for life
- [medium] Wheels are uniform dark cylinders with no rims, hubs, or tread and all four appear the same size, flattening the mechanical read (10, 12)
  - Fix: Add a contrasting rim/hub face and slightly larger rear tires to give the kart more believable stance and detail
- [low] The cockpit first-person view shows only a flat orange wedge and a black dash box; the player's own wheel and hands/arms area is absent, so the seated view lacks the kart presence promised by VR (01, 03, 08)
  - Fix: Bring the steering wheel rim and a hint of the nose into the cockpit frame so the driver sees a cohesive dashboard and wheel
- [low] Panel shading is nearly flat with minimal normal variation, so edges and surface breaks are hard to read even accounting for the software renderer (11, 12)
  - Fix: Add subtle bevels/chamfers and a secondary accent color stripe or decal to give the orange surfaces definition and brand identity

## Environment & Visual Cohesion Artist (google/gemini-3.1-pro-preview): 5/10

The bright color palette sets a cheerful foundation, but the complete lack of lighting, shadows, and surface detailing leaves the environment looking flat and makes it difficult to judge speed or depth.

- [high] The entire environment appears to be unlit (using flat/basic materials), lacking directional lighting and shadows. This completely breaks the 'sunny' art direction and removes all depth perception (seen in all screenshots).
  - Fix: Switch environment materials from Basic to Lambert or Standard. Add a strong DirectionalLight to simulate the sun, and enable shadow casting/receiving on the trees, barriers, track, and kart.
- [high] The track and grass surfaces are perfectly solid, featureless colors. This severely impairs the sense of speed, as there are no visual markers passing the camera to convey motion (Screenshots 03, 05, 08).
  - Fix: Introduce visual noise or patterns to the ground planes. Add subtle skid marks, track patches, a repeating stylized asphalt texture, or vertex color variations to the grass.
- [medium] The horizon is a harsh, abrupt line where an infinite flat green plane meets a solid blue sky, making the track feel like it exists in a void rather than a world (Screenshots 01, 04, 07).
  - Fix: Add a skybox with stylized low-poly clouds, surround the track with distant terrain (like low-poly hills or mountains), and implement distance fog to softly blend the ground into the sky.
- [medium] The red/white and green curbs appear to be painted completely flat onto the track surface, lacking the physical volume expected of a go-kart track curb (Screenshots 02, 06).
  - Fix: Model the curbs as actual 3D geometry with a slight elevation and bevel above the asphalt so they catch the light and feel tactile.
- [low] The scenery is overly repetitive and sparse, consisting solely of identical, evenly spaced trees with no variation or other landmarks to give the circuit character (Screenshots 04, 11).
  - Fix: Randomize the scale and rotation of the trees, cluster them more organically, and add diverse props like rocks, grandstands, arches, or the mentioned traffic cones to build a sense of place.

## UX & HUD Usability Lead (openai/gpt-5.5): 5/10

The UI is usable enough to start and drive, but persistent obstruction, clipped state prompts, and weak race HUD hierarchy make it feel rough rather than polished.

- [high] The large instructions panel remains on-screen during active racing and covers a major portion of the upper-left view in screenshots 03-07 and 09-12, which can block corner visibility and distract from driving.
  - Fix: Auto-collapse or fade the instructions panel once the race starts; replace it with a small Help/Controls button or show it only while paused/idle.
- [high] Critical cockpit prompts are clipped at the bottom edge: 'Throttle to start' in 01, 'Go!' in 02-04, and 'Finished - R to restart' in 08 are partially off-screen and hard to read.
  - Fix: Move state prompts into a centered, screen-safe overlay above the dashboard, or raise/scale the cockpit dashboard so all text fits within the safe area at 16:9.
- [high] Race information hierarchy is weak in cockpit view: lap, time, best lap, and speed are either not visible or mostly hidden by the low dashboard in 03-04 and 08, making time-trial progress hard to monitor.
  - Fix: Add a compact readable HUD/dash cluster near the lower-center or upper-right safe area showing Lap 1/3, current lap time, best lap, and speed with large typography.
- [medium] The start flow is not clearly communicated: screenshot 02 is labeled countdown but no countdown number is visible, and 'Go!' appears to persist into normal racing in 03-04.
  - Fix: Implement a clear centered 3-2-1-Go sequence, then fade 'Go!' out within about one second after the race begins.
- [medium] The finish state is under-communicated: 08 and 09 show only a clipped or tiny restart message, with no clear final results or race summary.
  - Fix: Show a finish overlay with 'Race Complete', total time, best lap, individual lap times, and prominent Restart/Drive Again actions.
- [medium] The instructions panel omits the C key for chase-camera toggle, despite that being an intended desktop control; this hurts discoverability of an important view option.
  - Fix: Add 'C: toggle chase camera' to the control list and consider showing the current camera mode briefly when toggled.
- [medium] Chase-view kart dashboard text is very small and partially obscured by the seat/kart body in 05-07 and 09, so speed/lap info is not reliably readable from that camera.
  - Fix: Use a camera-independent HUD layer for essential race info, or enlarge the rear-facing dashboard readouts and move them above the seat silhouette.
- [low] There are duplicate VR entry affordances: the browser/native 'Enter XR' button at top center and the panel's 'Enter VR' button in screenshots 01-12, which adds visual clutter.
  - Fix: Keep one primary XR entry affordance, or make the panel button match the native label and hide one when the other is available.
- [low] For seated VR, the usable information appears either as a flat desktop-style panel in the upper-left or on a very low dashboard, which could require uncomfortable gaze shifts if mirrored in XR.
  - Fix: In immersive mode, use world-locked cockpit instruments and optional floating prompts placed near natural forward gaze, avoiding large head-locked panels.

## Gameplay & Game Feel Designer (anthropic/claude-sonnet-4.6): 6/10

Sunny Circuit delivers a complete and stable time-trial loop with a working ghost and dual camera modes, but is held back by a visually monotonous track that reads as one long straight from the cockpit, a near-total absence of in-race HUD feedback (lap count, delta time, lap timer) during cockpit play, no perceptible impact or off-track feedback, and a finish screen that shows no celebratory moment or final results.

- [high] No live HUD during cockpit driving: screenshots 03 and 04 show zero lap counter, lap timer, or delta-to-ghost readout in cockpit mode; the only data visible is a tiny speed and time on the kart dashboard in chase view (screenshot 07) which is unreadable at race distance
  - Fix: Add a persistent screen-space HUD overlay (top-center) showing current lap / total laps, current lap elapsed time, and a +/- delta versus best lap in a large legible font; this must be visible in both cockpit and chase modes
- [high] Track reads as featureless straights from the cockpit: screenshots 03 and 04 are nearly identical flat grey corridors with identical blue-white barriers; the corner in 04 is only detectable by a very slight barrier angle, giving no sense of the corner's severity, braking point, or layout variety
  - Fix: Add apex kerb markings, brake-marker boards at 100/50 m before significant corners, and at least one elevation change or chicane so the driver can read and anticipate the racing line from the cockpit view
- [high] No feedback for wall hits or going off-track: telemetry shows wallHits up to 18 and offAsphaltRatio up to 0.92 in stress scenarios, yet screenshots show no screen flash, camera shake, speed penalty indicator, or dirt/rumble-strip colour change to communicate contact to the player
  - Fix: Implement a brief red screen-edge flash on wall contact, a camera shake proportional to impact force, and a visible speed readout colour change (e.g. green→red) when off-asphalt; add a rumble-strip colour band at track edges to visually telegraph the limit
- [high] Finish screen (screenshots 08-09) shows only a small partially-cropped text line 'speed → R to restart' with no final time, best lap display, improvement delta, or any celebratory element; there is no moment of closure to motivate a retry
  - Fix: Display a full-screen or prominent overlay on race completion showing: total race time, best lap time, improvement vs previous best lap (if any), and a large 'R to Restart' prompt with a brief camera pan or fanfare to reward the player
- [medium] The instruction panel (screenshots 01–09) persists at full opacity during the entire race, occupying the top-left quadrant and overlapping track vision in cockpit mode, which is distracting and reduces the racing FOV
  - Fix: Fade the instruction panel to near-invisible (10–15% opacity) 3 seconds after the race starts; make it re-appear on pressing Escape or when the kart is stationary, to keep info available without cluttering the racing view
- [medium] Sense of speed in cockpit view is very low: screenshots 03 and 04 at ~80 km/h look almost static—no FOV breathing, no motion blur on barriers, no instrument needle animation
  - Fix: Add a subtle dynamic FOV increase (e.g. 75°→85°) that scales with speed, and animate the steering wheel rotation to mirror steering input; even without GPU blur these two changes will significantly amplify perceived velocity
- [low] Traffic cones are advertised as interactive but none appear in any screenshot, and telemetry shows no cone-collision events; their presence and interactivity cannot be verified or enjoyed
  - Fix: Place visible cone chicanes at 2–3 corners on the racing line so they are encountered naturally during a clean lap, and add a brief sound cue or score penalty when knocked to make the interaction meaningful
