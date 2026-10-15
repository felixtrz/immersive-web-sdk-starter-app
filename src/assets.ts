import { AssetType, defineAssets } from '@iwsdk/core';
import cone from './scene-assets/cone.scene-asset.js';
import ghostKart from './scene-assets/ghost-kart.scene-asset.js';
import steeringWheel from './scene-assets/steering-wheel.scene-asset.js';
import track from './scene-assets/track.scene-asset.js';

// Build every public URL from BASE_URL so the runtime, the managed editor, and
// subpath builds all resolve the same file.
const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  track,
  kart: {
    url: publicAssetUrl('gltf/kart/kart.glb'),
    type: AssetType.GLTF,
    name: 'Player Kart',
  },
  'ghost-kart': ghostKart,
  'steering-wheel': steeringWheel,
  cone,
  dashboard: {
    url: publicAssetUrl('ui/dashboard.uikitml'),
    type: AssetType.UIKitML,
    name: 'Cockpit Dashboard',
  },
  hud: {
    url: publicAssetUrl('ui/hud.uikitml'),
    type: AssetType.UIKitML,
    name: 'Race HUD',
  },
  'hud-center': {
    url: publicAssetUrl('ui/hud-center.uikitml'),
    type: AssetType.UIKitML,
    name: 'Race Messages',
  },
  'race-panel': {
    url: publicAssetUrl('ui/race-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Race Panel',
  },
});
