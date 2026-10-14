import { createSystem, Entity, PhysicsBody, PhysicsManipulation } from '@iwsdk/core';
import { Cone, Kart, KartControls, RacePhase, RaceState } from '../race-components.js';
import { createKartState, DriveMode, type KartInput, resetKartState, stepKart } from '../sim/kart-physics.js';

const CONE_RADIUS = 1.0;

/**
 * Bridges the pure kart integrator (src/sim/kart-physics.ts) into the ECS:
 * reads controls, steps the shared physics, writes the pose back, and knocks
 * cones (Havok Dynamic bodies) by handing them a velocity.
 */
export class KartDriveSystem extends createSystem({
  kart: { required: [Kart, KartControls, RaceState] },
  cones: { required: [Cone, PhysicsBody] },
}) {
  private coneVel: [number, number, number] = [0, 0, 0];
  private state = createKartState();
  private controls: KartInput = { throttle: 0, brake: 0, steer: 0 };

  init(): void {
    this.queries.kart.subscribe(
      'qualify',
      (entity) => {
        resetKartState(this.state);
        this.writeBack(entity);
      },
      true,
    );
  }

  update(delta: number): void {
    const kart = this.queries.kart.entities.values().next().value as Entity | undefined;
    const obj = kart?.object3D;
    if (!kart || !obj) return;

    // Restart and teleports write the ECS/Object3D directly; read them back in.
    const s = this.state;
    s.x = obj.position.x;
    s.z = obj.position.z;
    s.yaw = kart.getValue(Kart, 'yaw')!;
    s.vx = kart.getValue(Kart, 'velX')!;
    s.vz = kart.getValue(Kart, 'velZ')!;
    s.trackIdx = kart.getValue(Kart, 'trackIdx')!;

    this.controls.throttle = kart.getValue(KartControls, 'throttle')!;
    this.controls.brake = kart.getValue(KartControls, 'brake')!;
    this.controls.steer = kart.getValue(KartControls, 'steer')!;

    const phase = kart.getValue(RaceState, 'phase');
    const mode =
      phase === RacePhase.Racing ? DriveMode.Racing : phase === RacePhase.Finished ? DriveMode.Finished : DriveMode.Locked;
    stepKart(s, this.controls, delta, mode, kart.getValue(Kart, 'maxSpeed')!);

    for (const cone of this.queries.cones.entities) {
      const co = cone.object3D;
      if (!co || cone.hasComponent(PhysicsManipulation)) continue;
      const dx = co.position.x - s.x;
      const dz = co.position.z - s.z;
      if (dx * dx + dz * dz < CONE_RADIUS * CONE_RADIUS && co.position.y < 0.6) {
        this.coneVel[0] = s.vx * 1.2 + dx * 2;
        this.coneVel[1] = 3 + Math.hypot(s.vx, s.vz) * 0.15;
        this.coneVel[2] = s.vz * 1.2 + dz * 2;
        cone.addComponent(PhysicsManipulation, { linearVelocity: this.coneVel });
        s.vx *= 0.95;
        s.vz *= 0.95;
        s.impact = Math.max(s.impact, 1.5);
      }
    }

    this.writeBack(kart);
  }

  private writeBack(kart: Entity): void {
    const s = this.state;
    kart.object3D?.position.set(s.x, 0, s.z);
    kart.object3D?.rotation.set(0, s.yaw, 0);
    kart.setValue(Kart, 'yaw', s.yaw);
    kart.setValue(Kart, 'velX', s.vx);
    kart.setValue(Kart, 'velZ', s.vz);
    kart.setValue(Kart, 'speed', s.speed);
    kart.setValue(Kart, 'slip', s.slip);
    kart.setValue(Kart, 'impact', s.impact);
    kart.setValue(Kart, 'trackIdx', s.trackIdx);
  }
}
