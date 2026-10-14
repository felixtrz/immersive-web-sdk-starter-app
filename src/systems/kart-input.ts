import { createSystem, Entity, InputComponent, Vector3, VisibilityState } from '@iwsdk/core';
import { KartControls, SteeringWheel } from '../race-components.js';

const KEY_STEER_RATE = 4;
const WHEEL_RETURN_RATE = 5;
const GRAB_RADIUS = 0.35;
const HANDS = ['left', 'right'] as const;

/**
 * Keyboard / gamepad / XR triggers -> KartControls. In XR the wheel is steered by
 * squeezing near it and turning the hand around the hub; with two hands the
 * deltas are averaged. The wheel's visual angle always mirrors the steer value.
 */
export class KartInputSystem extends createSystem({
  kart: { required: [KartControls] },
  wheel: { required: [SteeringWheel] },
}) {
  private keySteer = 0;
  private local = new Vector3();
  private grabbing = { left: false, right: false };
  private handStart = { left: 0, right: 0 };
  private wheelStart = { left: 0, right: 0 };

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const wheel = this.queries.wheel.entities.values().next().value as Entity | undefined;
    if (!kart) return;
    const dt = Math.min(delta, 0.05);
    const kb = this.input.keyboard;

    let throttle = kb.getKeyPressed('KeyW') || kb.getKeyPressed('ArrowUp') ? 1 : 0;
    let brake = kb.getKeyPressed('KeyS') || kb.getKeyPressed('ArrowDown') || kb.getKeyPressed('Space') ? 1 : 0;
    const keyDir =
      (kb.getKeyPressed('KeyD') || kb.getKeyPressed('ArrowRight') ? 1 : 0) -
      (kb.getKeyPressed('KeyA') || kb.getKeyPressed('ArrowLeft') ? 1 : 0);
    let steerTarget: number | null = null;

    const pad = navigator.getGamepads?.()[0];
    if (pad && pad.connected && pad.mapping === 'standard') {
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) steerTarget = ax;
    }

    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const left = this.input.xr.gamepads.left;
    const right = this.input.xr.gamepads.right;
    if (immersive) {
      throttle = Math.max(throttle, right?.getButtonValue(InputComponent.Trigger) ?? 0);
      brake = Math.max(brake, left?.getButtonValue(InputComponent.Trigger) ?? 0);
      const stick = left?.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.15) steerTarget = stick.x;
    }

    const maxAngle = wheel ? wheel.getValue(SteeringWheel, 'maxAngle')! : 1.57;
    let angle = wheel ? wheel.getValue(SteeringWheel, 'angle')! : 0;
    let grabbed = false;

    if (immersive && wheel?.object3D) {
      let sum = 0;
      let count = 0;
      for (const hand of HANDS) {
        const gp = hand === 'left' ? left : right;
        const squeeze = gp?.getButtonPressed(InputComponent.Squeeze) ?? false;
        const handAngle = this.handAngle(wheel, hand, angle);
        if (squeeze && !this.grabbing[hand] && handAngle !== null && this.local.length() < GRAB_RADIUS) {
          this.grabbing[hand] = true;
          this.handStart[hand] = handAngle;
          this.wheelStart[hand] = angle;
        } else if (!squeeze) {
          this.grabbing[hand] = false;
        }
        if (this.grabbing[hand] && handAngle !== null) {
          let d = handAngle - this.handStart[hand];
          d = Math.atan2(Math.sin(d), Math.cos(d));
          sum += this.wheelStart[hand] + d;
          count++;
        }
      }
      if (count > 0) {
        grabbed = true;
        angle = Math.max(-maxAngle, Math.min(maxAngle, sum / count));
      }
    }

    let steer: number;
    if (grabbed) {
      steer = -angle / maxAngle;
    } else {
      if (steerTarget === null) {
        const target = keyDir;
        const step = KEY_STEER_RATE * dt;
        this.keySteer += Math.max(-step, Math.min(step, target - this.keySteer));
        if (keyDir === 0) this.keySteer *= Math.exp(-WHEEL_RETURN_RATE * dt);
        steer = this.keySteer;
      } else {
        this.keySteer = steerTarget;
        steer = steerTarget;
      }
      angle = -steer * maxAngle;
    }

    kart.setValue(KartControls, 'throttle', throttle);
    kart.setValue(KartControls, 'brake', brake);
    kart.setValue(KartControls, 'steer', Math.max(-1, Math.min(1, steer)));
    kart.setValue(KartControls, 'wheelGrabbed', grabbed);

    if (wheel?.object3D) {
      wheel.setValue(SteeringWheel, 'angle', angle);
      wheel.object3D.rotation.z = angle;
    }
  }

  /** Hand angle around the hub in the wheel's un-rotated plane; sets this.local. */
  private handAngle(wheel: Entity, hand: 'left' | 'right', currentAngle: number): number | null {
    const grip = this.player.gripSpaces[hand];
    if (!grip || !wheel.object3D) return null;
    grip.getWorldPosition(this.local);
    wheel.object3D.worldToLocal(this.local);
    const a = Math.atan2(this.local.y, this.local.x) + currentAngle;
    this.local.z = 0;
    return a;
  }
}
