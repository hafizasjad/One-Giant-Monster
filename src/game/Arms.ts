import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type { ArmsInput } from '../../shared/protocol.ts';
import type { Monster } from './Monster.ts';

const HAND_SPEED = 4.2;
const GRAB_RANGE = 1.6;
const LEVER_RANGE = 1.4;

export interface ArmsWorld {
  /** Nearest grabbable entity to a point, or -1. */
  nearestGrabbable(p: { x: number; y: number; z: number }, range: number): number;
  bodyOf(entity: number): RigidBody;
  /** Index of the nearest lever within range, or -1. */
  leverNear(p: { x: number; y: number; z: number }, range: number): number;
  toggleLever(lever: number): void;
  emit(k: string, p?: { x: number; y: number; z: number }, txt?: string): void;
}

/** The hand target steered by the Arms player, plus grab / throw logic. */
export class Arms {
  body: RigidBody;
  collider: Collider;
  /** hand position in monster space: r = to the monster's right, y = up from feet, f = forward */
  local = { r: 0, y: 2.9, f: 1.7 };
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  held = -1;
  charge = 0;
  reachScale = 1;
  private prevGrab = false;
  private prevThrow = false;
  private ghost = 0; // time the hand stays non-solid after letting go

  constructor(R: typeof RAPIER, world: World, private monster: Monster) {
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider = world.createCollider(R.ColliderDesc.ball(0.38), this.body);
    this.place();
    this.body.setTranslation(this.pos, true);
  }

  private place() {
    const m = this.monster, f = m.forward, r = m.right;
    this.pos = {
      x: m.pos.x + r.x * this.local.r + f.x * this.local.f,
      y: m.feetY + this.local.y,
      z: m.pos.z + r.z * this.local.r + f.z * this.local.f,
    };
  }

  drop(w: ArmsWorld, silent = false) {
    if (this.held < 0) return;
    const b = w.bodyOf(this.held);
    b.setLinvel({ x: this.vel.x * 0.6, y: this.vel.y * 0.6, z: this.vel.z * 0.6 }, true);
    this.held = -1;
    this.charge = 0;
    this.ghost = 0.3;
    if (!silent) w.emit('drop', this.pos);
  }

  step(dt: number, input: ArmsInput, w: ArmsWorld) {
    const s = this.reachScale;
    const l = this.local;
    l.r = clamp(l.r + input.ax * HAND_SPEED * dt, -1.9 * s, 1.9 * s);
    l.y = clamp(l.y + input.ay * HAND_SPEED * dt, 0.3, 3.8 * s);
    l.f = clamp(l.f + input.reach * HAND_SPEED * dt, 1.2, 2.8 * s);

    const old = this.pos;
    this.place();
    this.vel = { x: (this.pos.x - old.x) / dt, y: (this.pos.y - old.y) / dt, z: (this.pos.z - old.z) / dt };
    this.body.setNextKinematicTranslation(this.pos);

    // Grab is a toggle: press to grab the nearest thing (or pull a lever), press again to drop.
    if (input.grab && !this.prevGrab) {
      if (this.held >= 0) {
        this.drop(w);
      } else {
        // A lever in reach wins over loose things lying next to it.
        const e = w.nearestGrabbable(this.pos, GRAB_RANGE);
        const lever = w.leverNear(this.pos, LEVER_RANGE);
        if (lever >= 0) {
          w.toggleLever(lever);
        } else if (e >= 0) {
          this.held = e;
          this.charge = 0;
          w.emit('grab', this.pos);
        } else {
          w.emit('miss', this.pos);
        }
      }
    }
    this.prevGrab = input.grab;

    if (this.held >= 0) {
      const b = w.bodyOf(this.held);
      const p = b.translation();
      const dx = this.pos.x - p.x, dy = this.pos.y - p.y, dz = this.pos.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 4) {
        this.drop(w); // it got stuck behind something
      } else {
        const k = Math.min(18, 26 / Math.max(dist, 1e-3));
        b.setLinvel({ x: dx * k, y: dy * k, z: dz * k }, true);
        const av = b.angvel();
        b.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);

        if (input.throw) this.charge = Math.min(1, this.charge + dt / 0.9);
        if (!input.throw && this.prevThrow) {
          const f = this.monster.forward;
          const fwd = 7 + 11 * this.charge, up = 5 + 4 * this.charge;
          b.setLinvel({
            x: f.x * fwd + this.monster.vel.x * 0.5,
            y: up,
            z: f.z * fwd + this.monster.vel.z * 0.5,
          }, true);
          b.setAngvel({ x: -f.z * 6, y: 0, z: f.x * 6 }, true);
          this.held = -1;
          this.charge = 0;
          this.ghost = 0.35;
          w.emit('throw', this.pos);
        }
      }
    }
    this.prevThrow = input.throw;

    // The hand is solid (it can shove things) except while carrying or just after letting go.
    this.ghost -= dt;
    const sensor = this.held >= 0 || this.ghost > 0;
    if (this.collider.isSensor() !== sensor) this.collider.setSensor(sensor);
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
