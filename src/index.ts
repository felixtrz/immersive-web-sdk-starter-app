import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AutopilotSystem } from './systems/autopilot.js';
import { CameraModeSystem } from './systems/camera-mode.js';
import { CaptureProbeSystem } from './systems/capture-probe.js';
import { CockpitRigSystem } from './systems/cockpit-rig.js';
import { DashboardSystem } from './systems/dashboard.js';
import { EnvironmentSystem } from './systems/environment.js';
import { GhostSystem } from './systems/ghost.js';
import { HudSystem } from './systems/hud.js';
import { KartAudioSystem } from './systems/kart-audio.js';
import { KartDriveSystem } from './systems/kart-drive.js';
import { KartInputSystem } from './systems/kart-input.js';
import { LapSystem } from './systems/lap.js';
import { RaceSystem } from './systems/race.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Lower priority runs first: input -> phase -> integrate -> laps -> ghost -> presentation.
  world
    .registerSystem(KartInputSystem, { priority: -40 })
    .registerSystem(RaceSystem, { priority: -35 })
    .registerSystem(KartDriveSystem, { priority: -30 })
    .registerSystem(LapSystem, { priority: -25 })
    .registerSystem(GhostSystem, { priority: -20 })
    .registerSystem(CockpitRigSystem, { priority: -15 })
    .registerSystem(CameraModeSystem, { priority: -10 })
    .registerSystem(EnvironmentSystem, { priority: -5 })
    .registerSystem(KartAudioSystem)
    .registerSystem(DashboardSystem)
    .registerSystem(HudSystem);

  const params = new URLSearchParams(location.search);
  if (params.has('autopilot')) {
    world.registerSystem(AutopilotSystem, { priority: -38 });
  }
  if (params.has('capture')) {
    world.registerSystem(CaptureProbeSystem);
  }
});
