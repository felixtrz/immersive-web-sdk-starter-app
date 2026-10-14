import { defineComponents } from '@iwsdk/core';
import {
  Cone,
  Dashboard,
  Ghost,
  Kart,
  KartAudioState,
  KartControls,
  RacePanel,
  RaceState,
  SteeringWheel,
} from './race-components.js';

export default defineComponents([
  Kart,
  KartControls,
  RaceState,
  KartAudioState,
  SteeringWheel,
  Ghost,
  Cone,
  Dashboard,
  RacePanel,
]);
