import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, KinematicCharacterController, RigidBody, World } from '@dimforge/rapier3d-compat';
import type { LegsInput } from '../../shared/protocol.ts';
import type { V3 } from './level1.ts';

export const MONSTER_RADIUS = 0.9;
export const MONSTER_HALF = 0.6; // capsule half height (segment)
const SPEED = 6.2;
const JUMP = 9.2;
export const GRAVITY = 20;

export interface MonsterHooks {
  onJump(): void;
  onLand(impact: number): void;
}

/** The shared body. Kinematic capsule driven by the Legs player. */
export class Monster {
  body: RigidBody;
  collider: Collider;
  cc: KinematicCharacterController;
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, z: 0 };
  kb = { x: 0, z: 0 }; // knockback velocity, decays
  vy = 0;
  yaw = Math.PI; // facing -Z
  grounded = false;
  slick = false;
  private coyote = 0;
  private jumpBuf = 0;
  private prevJump = false;

  constructor(R: typeof RAPIER, world: World, spawn: V3) {
    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn[0], spawn[1], spawn[2]),
    );
    this.collider = world.createCollider(R.ColliderDesc.capsule(MONSTER_HALF, MONSTER_RADIUS), this.body);
    this.cc = world.createCharacterController(0.05);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc.enableAutostep(0.4, 0.3, false);
    this.cc.enableSnapToGround(0.3);
    this.cc.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.pos = { x: spawn[0], y: spawn[1], z: spawn[2] };
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  /** The monster's right-hand side (screen right when it faces away from the camera). */
  get right() {
    return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
  }

  get feetY() {
    return this.pos.y - MONSTER_HALF - MONSTER_RADIUS;
  }

  teleport(p: V3) {
    this.pos = { x: p[0], y: p[1], z: p[2] };
    this.vel = { x: 0, z: 0 };
    this.kb = { x: 0, z: 0 };
    this.vy = 0;
    this.body.setTranslation(this.pos, true);
    this.body.setNextKinematicTranslation(this.pos);
  }

  knock(x: number, y: number, z: number) {
    this.kb.x += x;
    this.kb.z += z;
    this.hop(y);
  }

  hop(v: number) {
    this.vy = v;
    this.grounded = false;
    this.coyote = 0;
  }

  step(dt: number, input: LegsInput, include: (c: Collider) => boolean, hooks: MonsterHooks) {
    let mx = input.mx, mz = input.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const accel = this.grounded ? (this.slick ? 1.4 : 14) : 5;
    const k = Math.min(1, accel * dt);
    this.vel.x += (mx * SPEED - this.vel.x) * k;
    this.vel.z += (mz * SPEED - this.vel.z) * k;

    if (len > 0.1) {
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const maxTurn = 10 * dt;
      this.yaw += Math.max(-maxTurn, Math.min(maxTurn, d));
    }

    // Jump with a little buffering and coyote time so it feels responsive.
    if (input.jump && !this.prevJump) this.jumpBuf = 0.12;
    this.prevJump = input.jump;
    this.jumpBuf -= dt;
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.hop(JUMP);
      this.jumpBuf = 0;
      hooks.onJump();
    }

    this.vy = Math.max(-40, this.vy - GRAVITY * dt);
    const desired = {
      x: (this.vel.x + this.kb.x) * dt,
      y: this.vy * dt,
      z: (this.vel.z + this.kb.z) * dt,
    };
    this.cc.computeColliderMovement(this.collider, desired, undefined, undefined, include);
    const m = this.cc.computedMovement();
    const wasGrounded = this.grounded;
    const fallSpeed = this.vy;
    this.grounded = this.vy <= 0 && this.cc.computedGrounded();
    if (this.grounded) {
      if (!wasGrounded && fallSpeed < -6) hooks.onLand(-fallSpeed);
      this.vy = -2;
    } else if (this.vy > 0 && m.y < desired.y - 1e-3) {
      this.vy = 0; // bumped the ceiling
    }

    this.pos.x += m.x;
    this.pos.y += m.y;
    this.pos.z += m.z;
    this.body.setNextKinematicTranslation(this.pos);

    const decay = Math.exp(-4 * dt);
    this.kb.x *= decay;
    this.kb.z *= decay;
  }
}
