import { createSystem, InputComponent, Vector3, VisibilityState } from '@iwsdk/core';
import { KartControls, SteeringWheel } from '../race-components.js';
import { type EntityRef, trackSingle } from './query-refs.js';

const KEY_STEER_RATE = 4;
const WHEEL_RETURN_RATE = 5;
/** Hand roll (radians) that maps to full steering lock. */
const HAND_FULL_LOCK = 1.0;
const HAND_DEADZONE = 0.04;
const HAND_SMOOTHING = 18;
const MIN_HAND_SPAN = 0.12;
/**
 * Thumb-to-index tip joint distance (m) for a fully closed / fully open pinch.
 * Joint poses are finger-tip centres, so a firm pinch still reads ~1.5-2 cm and
 * a relaxed open hand ~3.5-5 cm. OPEN must sit below the relaxed reading or an
 * idle hand produces constant partial brake/throttle.
 */
const PINCH_CLOSED = 0.02;
const PINCH_OPEN = 0.035;
const PINCH_DEADZONE = 0.1;

type PoseFillingFrame = XRFrame & {
  fillPoses?: (spaces: XRSpace[], baseSpace: XRSpace, transforms: Float32Array) => boolean;
};

/**
 * Keyboard / gamepad / XR -> KartControls.
 *
 * In XR there is no grabbing: the steering angle is the roll of the line from
 * the left grip to the right grip, so holding both hands (or controllers) up
 * like an imaginary wheel and tilting them steers. Throttle is the right
 * trigger or right-hand pinch, brake the left trigger or left-hand pinch,
 * both analog. The wheel's visual angle always mirrors the steer value.
 */
export class KartInputSystem extends createSystem({
  kart: { required: [KartControls] },
  wheel: { required: [SteeringWheel] },
}) {
  private kartRef!: EntityRef;
  private wheelRef!: EntityRef;
  private keySteer = 0;
  private handSteer = 0;
  private leftPos = new Vector3();
  private rightPos = new Vector3();
  private pinch = { left: 0, right: 0 };
  private tracked = { left: false, right: false };
  /** navigator.getGamepads() returns a fresh array per call, so only poll once a pad exists. */
  private padsConnected = 0;
  /** Reused thumb-tip / index-tip space pair and their 2x4x4 pose matrices for fillPoses. */
  private readonly tipSpaces: XRSpace[] = [];
  private readonly tipPoses = new Float32Array(32);

  init(): void {
    this.kartRef = trackSingle(this.queries.kart, this.cleanupFuncs);
    this.wheelRef = trackSingle(this.queries.wheel, this.cleanupFuncs);

    const onConnect = () => this.padsConnected++;
    const onDisconnect = () => (this.padsConnected = Math.max(0, this.padsConnected - 1));
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    this.cleanupFuncs.push(
      () => window.removeEventListener('gamepadconnected', onConnect),
      () => window.removeEventListener('gamepaddisconnected', onDisconnect),
    );
  }

  update(delta: number): void {
    const kart = this.kartRef.current;
    const wheel = this.wheelRef.current;
    if (!kart) return;
    const dt = Math.min(delta, 0.05);
    const kb = this.input.keyboard;

    let throttle = kb.getKeyPressed('KeyW') || kb.getKeyPressed('ArrowUp') ? 1 : 0;
    let brake = kb.getKeyPressed('KeyS') || kb.getKeyPressed('ArrowDown') || kb.getKeyPressed('Space') ? 1 : 0;
    const keyDir =
      (kb.getKeyPressed('KeyD') || kb.getKeyPressed('ArrowRight') ? 1 : 0) -
      (kb.getKeyPressed('KeyA') || kb.getKeyPressed('ArrowLeft') ? 1 : 0);
    let steerTarget: number | null = null;

    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!immersive && this.padsConnected > 0) {
      const pad = navigator.getGamepads()[0];
      if (pad && pad.connected && pad.mapping === 'standard') {
        throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
        brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
        const ax = pad.axes[0] ?? 0;
        if (Math.abs(ax) > 0.12) steerTarget = ax;
      }
    }

    const maxAngle = wheel ? wheel.getValue(SteeringWheel, 'maxAngle')! : 1.57;
    let handSteering = false;

    if (immersive) {
      this.readXRSources();
      throttle = Math.max(throttle, this.pinch.right);
      brake = Math.max(brake, this.pinch.left);

      const stick = this.input.xr.gamepads.left?.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.15) {
        steerTarget = stick.x;
      } else if (this.tracked.left && this.tracked.right) {
        this.player.gripSpaces.left.getWorldPosition(this.leftPos);
        this.player.gripSpaces.right.getWorldPosition(this.rightPos);
        const dx = this.rightPos.x - this.leftPos.x;
        const dy = this.rightPos.y - this.leftPos.y;
        const dz = this.rightPos.z - this.leftPos.z;
        const horizontal = Math.sqrt(dx * dx + dz * dz);
        if (horizontal * horizontal + dy * dy > MIN_HAND_SPAN * MIN_HAND_SPAN) {
          // Right hand dropping below the left = clockwise wheel = steer right.
          let roll = -Math.atan2(dy, horizontal);
          roll = Math.abs(roll) < HAND_DEADZONE ? 0 : roll - Math.sign(roll) * HAND_DEADZONE;
          const target = Math.max(-1, Math.min(1, roll / (HAND_FULL_LOCK - HAND_DEADZONE)));
          this.handSteer += (target - this.handSteer) * Math.min(1, dt * HAND_SMOOTHING);
          handSteering = true;
        }
      }
    }

    let steer: number;
    if (handSteering && steerTarget === null) {
      steer = this.handSteer;
      this.keySteer = steer;
    } else if (steerTarget === null) {
      const step = KEY_STEER_RATE * dt;
      this.keySteer += Math.max(-step, Math.min(step, keyDir - this.keySteer));
      if (keyDir === 0) this.keySteer *= Math.exp(-WHEEL_RETURN_RATE * dt);
      steer = this.keySteer;
      this.handSteer = steer;
    } else {
      this.keySteer = steerTarget;
      this.handSteer = steerTarget;
      steer = steerTarget;
    }
    steer = Math.max(-1, Math.min(1, steer));
    const angle = -steer * maxAngle;

    kart.setValue(KartControls, 'throttle', throttle);
    kart.setValue(KartControls, 'brake', brake);
    kart.setValue(KartControls, 'steer', steer);
    kart.setValue(KartControls, 'wheelGrabbed', handSteering);

    if (wheel?.object3D) {
      wheel.setValue(SteeringWheel, 'angle', angle);
      wheel.object3D.rotation.z = angle;
    }
  }

  /**
   * Per hand: whether a grip pose exists and the analog pinch value. Tracked
   * hands measure thumb-to-index distance; controllers use the trigger.
   */
  private readXRSources(): void {
    this.tracked.left = this.tracked.right = false;
    this.pinch.left = this.pinch.right = 0;
    const xr = this.world.renderer.xr;
    const session = xr.getSession();
    const frame = xr.getFrame() as PoseFillingFrame | null;
    const ref = xr.getReferenceSpace();
    if (!session || !frame || !ref) return;
    const sources = session.inputSources;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const side = src.handedness;
      if (side !== 'left' && side !== 'right') continue;
      if (src.hand) {
        const d = this.tipDistance(frame, src.hand, ref);
        if (d < 0) continue;
        this.tracked[side] = true;
        const v = 1 - (d - PINCH_CLOSED) / (PINCH_OPEN - PINCH_CLOSED);
        const pinch = v < PINCH_DEADZONE ? 0 : Math.min(1, (v - PINCH_DEADZONE) / (1 - PINCH_DEADZONE));
        this.pinch[side] = Math.max(this.pinch[side], pinch);
      } else if (src.gripSpace || src.targetRaySpace) {
        this.tracked[side] = true;
        this.pinch[side] = Math.max(this.pinch[side], src.gamepad?.buttons[0]?.value ?? 0);
      }
    }
  }

  /**
   * Thumb-tip to index-tip distance, or -1 when untracked. `fillPoses` writes into a
   * reused buffer; `getJointPose` (fallback) allocates pose objects every call.
   */
  private tipDistance(frame: PoseFillingFrame, hand: XRHand, ref: XRReferenceSpace): number {
    const thumb = hand.get('thumb-tip');
    const index = hand.get('index-finger-tip');
    if (!thumb || !index) return -1;
    if (frame.fillPoses) {
      this.tipSpaces[0] = thumb;
      this.tipSpaces[1] = index;
      if (!frame.fillPoses(this.tipSpaces, ref, this.tipPoses)) return -1;
      const m = this.tipPoses;
      const dx = m[12] - m[28];
      const dy = m[13] - m[29];
      const dz = m[14] - m[30];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const tp = frame.getJointPose?.(thumb, ref);
    const ip = frame.getJointPose?.(index, ref);
    if (!tp || !ip) return -1;
    const a = tp.transform.position;
    const b = ip.transform.position;
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
}
