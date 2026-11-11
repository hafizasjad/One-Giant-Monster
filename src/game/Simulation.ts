import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import type { GameEvent, Inputs, Snapshot } from '../../shared/protocol.ts';
import { Arms, type ArmsWorld } from './Arms.ts';
import { Chaos } from './Chaos.ts';
import { buildLevel, type LevelDef, type V3 } from './level1.ts';
import { GRAVITY, Monster, MONSTER_HALF, MONSTER_RADIUS } from './Monster.ts';

export const DT = 1 / 60;

type P = { x: number; y: number; z: number };
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0
const BONKS = ['BONK!', 'OOF!', 'BOINK!', 'WHAM!', 'OW OW OW'];
const FUMBLES = ['SPLAT!', 'Whoopsie!', 'Aaaaaah!', 'Gravity wins!'];

export interface SimOptions {
  chaos?: boolean;
  seed?: number;
}

/**
 * The whole game state. No DOM, no rendering: feed it per-role inputs with step(),
 * read the result with snapshot(). Runs in the host's browser and in Node tests.
 */
export class Simulation {
  world: World;
  level: LevelDef;
  bodies: RigidBody[] = [];
  monster: Monster;
  arms: Arms;
  chaos: Chaos;
  armsWorld: ArmsWorld;

  time = 0;
  playTime = 0;
  leverOn = false;
  plateDown = false;
  targetHit = false;
  stars = 0;
  starCount = 0;
  fumbles = 0;
  finished = false;
  finalScore = 0;
  cp = -1;

  private events: GameEvent[] = [];
  private entityOf = new Map<number, number>(); // collider handle -> entity index
  private doorY: number;
  private bridgeZ: number;
  private drawAngle = Math.PI / 2;
  private hitCooldown = 0;
  private boulderTimer = 1;
  private boulderNext = 0;
  private farTimers = new Map<number, number>();
  private include: (c: Collider) => boolean;

  constructor(private R: typeof RAPIER, opts: SimOptions = {}) {
    this.level = buildLevel();
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = DT;

    this.level.entities.forEach((e, i) => {
      const desc =
        e.body === 'dynamic' ? R.RigidBodyDesc.dynamic()
        : e.tag === 'hammer' ? R.RigidBodyDesc.kinematicPositionBased()
        // Door and bridges are fixed bodies we reposition: Rapier's character
        // controller gets stuck walking on kinematic ones.
        : R.RigidBodyDesc.fixed();
      desc.setTranslation(e.pos[0], e.pos[1], e.pos[2]);
      if (e.body === 'dynamic') desc.setLinearDamping(0.1).setAngularDamping(0.3).setCcdEnabled(e.tag === 'ball');
      const body = this.world.createRigidBody(desc);
      const cd = e.shape === 'ball' ? R.ColliderDesc.ball(e.half[0]) : R.ColliderDesc.cuboid(e.half[0], e.half[1], e.half[2]);
      cd.setFriction(e.friction ?? 0.8).setRestitution(e.restitution ?? 0).setDensity(e.density ?? 1);
      const col = this.world.createCollider(cd, body);
      this.entityOf.set(col.handle, i);
      this.bodies.push(body);
    });
    for (const id of this.level.boulders.ids) this.bodies[id].setEnabled(false);

    this.doorY = this.level.lever.closedY;
    this.bridgeZ = this.level.plate.zIn;
    this.monster = new Monster(R, this.world, this.level.spawn);
    this.arms = new Arms(R, this.world, this.monster);
    this.chaos = new Chaos(opts.seed ?? 12345, opts.chaos ?? true);
    this.placeDrawbridge();

    const handHandle = this.arms.collider.handle;
    this.include = (c) => {
      if (c.handle === handHandle) return false;
      const e = this.entityOf.get(c.handle);
      if (e === undefined) return true;
      // Loose objects don't block the monster: its kinematic body bulldozes them.
      const def = this.level.entities[e];
      return def.body !== 'dynamic' && def.tag !== 'hammer';
    };

    this.armsWorld = {
      nearestGrabbable: (p, range) => {
        let best = -1, bestD = range;
        this.level.entities.forEach((e, i) => {
          if (e.tag !== 'crate' && e.tag !== 'ball') return;
          const t = this.bodies[i].translation();
          const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
          if (d < bestD) { bestD = d; best = i; }
        });
        return best;
      },
      bodyOf: (e) => this.bodies[e],
      leverDistance: (p) => dist(p, this.level.lever.pos),
      toggleLever: () => {
        this.leverOn = !this.leverOn;
        this.emit('lever', toP(this.level.lever.pos), this.leverOn ? 'CLUNK!' : 'clonk.');
      },
      emit: (k, p, txt) => this.emit(k, p, txt),
    };
  }

  emit(k: string, p?: P, txt?: string) {
    const ev: GameEvent = { k };
    if (p) ev.p = [r3(p.x), r3(p.y), r3(p.z)];
    if (txt) ev.txt = txt;
    this.events.push(ev);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  dispose() {
    this.world.free();
  }

  step(inputs: Inputs) {
    const dt = DT;
    this.time += dt;
    if (!this.finished) this.playTime += dt;

    this.chaos.step(dt, this);
    this.moveMachines(dt);
    this.monster.step(dt, inputs.legs, this.include, {
      onJump: () => this.emit('jump', this.monster.pos),
      onLand: (impact) => this.emit('land', this.monster.pos, impact > 14 ? 'THUD!' : undefined),
    });
    this.arms.step(dt, inputs.arms, this.armsWorld);
    this.world.step();
    this.afterStep(dt);
  }

  // --- kinematic machinery -------------------------------------------------

  private moveMachines(dt: number) {
    const L = this.level;

    // Door sinks into the floor when the lever is on.
    const doorTarget = this.leverOn ? L.lever.openY : L.lever.closedY;
    if (this.doorY !== doorTarget) {
      this.doorY = approach(this.doorY, doorTarget, 4 * dt);
      const dp = L.entities[L.lever.door].pos;
      this.bodies[L.lever.door].setTranslation({ x: dp[0], y: this.doorY, z: dp[2] }, true);
    }

    // Bridge extends while something sits on the pressure plate.
    const bridgeTarget = this.plateDown ? L.plate.zOut : L.plate.zIn;
    if (this.bridgeZ !== bridgeTarget) {
      this.bridgeZ = approach(this.bridgeZ, bridgeTarget, 4 * dt);
      const bp = L.entities[L.plate.bridge].pos;
      this.bodies[L.plate.bridge].setTranslation({ x: bp[0], y: bp[1], z: this.bridgeZ }, true);
    }

    // Drawbridge falls once the target has been hit.
    if (this.targetHit && this.drawAngle > 0) {
      this.drawAngle = Math.max(0, this.drawAngle - 0.9 * dt);
      if (this.drawAngle === 0) this.emit('land', toP(L.target.hinge), 'KA-THUNK!');
      this.placeDrawbridge();
    }

    for (const h of L.hammers) {
      const p = this.hammerPos(h, this.time);
      this.bodies[h.head].setNextKinematicTranslation(p);
    }
  }

  private hammerPos(h: LevelDef['hammers'][number], t: number): P {
    const a = h.amp * Math.sin(t * h.speed + h.phase);
    return { x: h.pivot[0] + Math.sin(a) * h.len, y: h.pivot[1] - Math.cos(a) * h.len, z: h.pivot[2] };
  }

  private placeDrawbridge() {
    const t = this.level.target, a = this.drawAngle;
    const pos = { x: t.hinge[0], y: t.hinge[1] + Math.sin(a) * t.halfLen, z: t.hinge[2] + Math.cos(a) * t.halfLen };
    const rot = { x: Math.sin(-a / 2), y: 0, z: 0, w: Math.cos(-a / 2) };
    const b = this.bodies[t.bridge];
    b.setTranslation(pos, true);
    b.setRotation(rot, true);
  }

  // --- rules ---------------------------------------------------------------

  private afterStep(dt: number) {
    const L = this.level, m = this.monster;

    // Pressure plate
    let down = within(m.pos.x, m.feetY, m.pos.z, L.plate);
    // Target, falling objects and stray balls
    L.entities.forEach((e, i) => {
      if (e.body !== 'dynamic' || e.tag === 'boulder') {
        if (e.tag === 'boulder' && this.bodies[i].isEnabled()) {
          const t = this.bodies[i].translation();
          if (!down && within(t.x, t.y - e.half[0], t.z, L.plate)) down = true;
        }
        return;
      }
      const b = this.bodies[i], t = b.translation();
      if (i !== this.arms.held && within(t.x, t.y - e.half[1], t.z, L.plate)) down = true;
      if (!this.targetHit && i !== this.arms.held && dist(t, L.target.pos) < L.target.r) {
        this.targetHit = true;
        this.emit('target', toP(L.target.pos), 'BULLSEYE!');
      }
      if (t.y < L.killY) this.respawnEntity(i);
      if (e.tag === 'ball') {
        // Balls stranded on the far side of the pit come back so the toss can't soft-lock.
        const far = !this.targetHit && i !== this.arms.held && t.z < -79;
        const ft = far ? (this.farTimers.get(i) ?? 0) + dt : 0;
        this.farTimers.set(i, ft);
        if (ft > 2.5) this.respawnEntity(i);
      }
    });
    if (down !== this.plateDown) {
      this.plateDown = down;
      this.emit('plate', toP(L.plate.pos), down ? 'click!' : undefined);
    }

    // Hazards
    this.hitCooldown -= dt;
    if (this.hitCooldown <= 0) {
      for (const h of L.hammers) {
        const p = this.bodies[h.head].translation();
        if (this.capsuleDist(p) < MONSTER_RADIUS + 1.0) {
          const dir = Math.sign(Math.cos(this.time * h.speed + h.phase)) || 1;
          this.bonk(dir * 12, 7.5, 0);
          break;
        }
      }
      for (const id of L.boulders.ids) {
        const b = this.bodies[id];
        if (!b.isEnabled()) continue;
        const v = b.linvel();
        const sp = Math.hypot(v.x, v.z);
        if (sp > 3 && this.capsuleDist(b.translation()) < MONSTER_RADIUS + 0.95) {
          this.bonk((v.x / sp) * 9, 6, (v.z / sp) * 9);
          break;
        }
      }
    }
    this.spawnBoulders(dt);

    // Stars
    L.stars.forEach((s, i) => {
      if (this.stars & (1 << i)) return;
      if (dist(m.pos, s) < 1.8 || dist(this.arms.pos, s) < 1.1) {
        this.stars |= 1 << i;
        this.starCount++;
        this.emit('star', toP(s), 'Star!');
      }
    });

    // Checkpoints, falling, finish
    while (this.cp + 1 < L.checkpoints.length && m.pos.z < L.checkpoints[this.cp + 1].z) {
      this.cp++;
      this.emit('checkpoint', m.pos, 'Checkpoint!');
    }
    if (m.pos.y < L.killY) {
      this.fumbles++;
      this.arms.drop(this.armsWorld, true);
      m.teleport(this.cp >= 0 ? L.checkpoints[this.cp].pos : L.spawn);
      this.emit('fumble', m.pos, FUMBLES[this.fumbles % FUMBLES.length]);
    }
    if (!this.finished && m.pos.z < L.finishZ && m.grounded) {
      this.finished = true;
      this.finalScore = Math.max(0, 3000 - Math.floor(this.playTime) * 10) + this.starCount * 200 - this.fumbles * 100;
      this.finalScore = Math.max(0, this.finalScore);
      this.emit('finish', m.pos, 'FINISH!');
    }
  }

  private bonk(x: number, y: number, z: number) {
    this.monster.knock(x, y, z);
    this.hitCooldown = 0.8;
    this.emit('bonk', this.monster.pos, BONKS[Math.floor(this.chaos.rng() * BONKS.length)]);
  }

  /** Distance from a point to the monster capsule's centre line. */
  private capsuleDist(p: P) {
    const m = this.monster.pos;
    const y = Math.max(m.y - MONSTER_HALF, Math.min(m.y + MONSTER_HALF, p.y));
    return Math.hypot(p.x - m.x, p.y - y, p.z - m.z);
  }

  private spawnBoulders(dt: number) {
    const B = this.level.boulders, z = this.monster.pos.z;
    if (this.finished || z > -41 || z < -70) return;
    this.boulderTimer -= dt;
    if (this.boulderTimer > 0) return;
    this.boulderTimer = B.interval;
    const b = this.bodies[B.ids[this.boulderNext]];
    this.boulderNext = (this.boulderNext + 1) % B.ids.length;
    const x = (this.chaos.rng() * 2 - 1) * 3.6;
    b.setEnabled(true);
    b.setTranslation({ x, y: B.y, z: B.z }, true);
    b.setLinvel({ x: 0, y: 0, z: B.speed }, true);
    b.setAngvel({ x: B.speed / 0.8, y: 0, z: 0 }, true);
    this.emit('rumble', { x, y: B.y, z: B.z });
  }

  private respawnEntity(i: number) {
    if (this.arms.held === i) this.arms.drop(this.armsWorld, true);
    const e = this.level.entities[i], b = this.bodies[i];
    b.setTranslation({ x: e.pos[0], y: e.pos[1] + 2, z: e.pos[2] }, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.farTimers.set(i, 0);
    this.emit('pop', { x: e.pos[0], y: e.pos[1] + 2, z: e.pos[2] });
  }

  // --- output --------------------------------------------------------------

  /** Full state for rendering / networking. Drains pending events into it. */
  snapshot(): Snapshot {
    const m = this.monster, a = this.arms;
    const b: number[] = [];
    for (const i of this.level.movable) {
      const body = this.bodies[i];
      if (!body.isEnabled()) {
        b.push(0, -99, 0, 0, 0, 0, 1);
        continue;
      }
      const t = body.translation(), q = body.rotation();
      b.push(r3(t.x), r3(t.y), r3(t.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w));
    }
    const c = this.chaos.cur;
    return {
      t: r3(this.time),
      m: [r3(m.pos.x), r3(m.pos.y), r3(m.pos.z), r3(m.yaw), r3(m.speed), m.grounded ? 1 : 0, r3(m.vy)],
      h: [r3(a.pos.x), r3(a.pos.y), r3(a.pos.z), a.held, r3(a.charge)],
      b,
      s: [this.leverOn ? 1 : 0, this.plateDown ? 1 : 0, this.targetHit ? 1 : 0],
      stars: this.stars,
      sc: [r3(this.playTime), this.fumbles, this.finished ? 1 : 0, this.finalScore, this.starCount],
      ch: c ? { name: c.name, warn: c.warn, t: r3(c.t) } : null,
      cp: this.cp,
      ev: this.drainEvents(),
    };
  }
}

function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
function toP(v: V3): P {
  return { x: v[0], y: v[1], z: v[2] };
}
function dist(p: P, v: V3) {
  return Math.hypot(p.x - v[0], p.y - v[1], p.z - v[2]);
}
function within(x: number, bottomY: number, z: number, plate: { pos: V3; half: number }) {
  return Math.abs(x - plate.pos[0]) < plate.half && Math.abs(z - plate.pos[2]) < plate.half && bottomY < 0.5 && bottomY > -0.5;
}
