import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import './systems/panel-ui-patch.js';
import { AutopilotSystem } from './systems/autopilot.js';
import { CameraModeSystem } from './systems/camera-mode.js';
import { CaptureProbeSystem } from './systems/capture-probe.js';
import { CockpitRigSystem } from './systems/cockpit-rig.js';
import { CrowdSystem } from './systems/crowd.js';
import { DashboardSystem } from './systems/dashboard.js';
import { EnvironmentSystem } from './systems/environment.js';
import { GhostSystem } from './systems/ghost.js';
import { HandVisibilitySystem } from './systems/hand-visibility.js';
import { HudSystem } from './systems/hud.js';
import { KartAudioSystem } from './systems/kart-audio.js';
import { KartDriveSystem } from './systems/kart-drive.js';
import { KartFeelSystem } from './systems/kart-feel.js';
import { KartInputSystem } from './systems/kart-input.js';
import { LapSystem } from './systems/lap.js';
import { RaceSystem } from './systems/race.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Lower priority runs first. App systems stay above every IWSDK built-in
  // (highest is XRLayerSystem at 1): input -> phase -> integrate -> laps ->
  // ghost -> presentation.
  world
    .registerSystem(KartInputSystem, { priority: 10 })
    .registerSystem(RaceSystem, { priority: 15 })
    .registerSystem(KartDriveSystem, { priority: 20 })
    .registerSystem(LapSystem, { priority: 25 })
    .registerSystem(GhostSystem, { priority: 30 })
    .registerSystem(CockpitRigSystem, { priority: 35 })
    .registerSystem(CameraModeSystem, { priority: 40 })
    .registerSystem(KartFeelSystem, { priority: 42 })
    .registerSystem(EnvironmentSystem, { priority: 45 })
    .registerSystem(CrowdSystem, { priority: 50 })
    .registerSystem(KartAudioSystem, { priority: 55 })
    .registerSystem(DashboardSystem, { priority: 60 })
    .registerSystem(HudSystem, { priority: 65 })
    .registerSystem(HandVisibilitySystem, { priority: 70 });

  const params = new URLSearchParams(location.search);
  if (params.has('autopilot')) {
    world.registerSystem(AutopilotSystem, { priority: 12 });
  }
  if (params.has('capture')) {
    world.registerSystem(CaptureProbeSystem, { priority: 90 });
  }
});
