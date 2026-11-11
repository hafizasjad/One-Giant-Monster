import { emptyHead, emptyLegs, emptySpecial, type HeadInput, type LegsInput, type SpecialInput } from '../../shared/protocol.ts';
import { MONSTER_Y } from './level1.ts';
import type { Simulation } from './Simulation.ts';

const DOWN_COURSE = Math.PI; // yaw when facing -Z
const REACH = 2.2; // how far in front of the monster the hand works comfortably

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Autopilot for the legs, head and special, so one person can play as the arms.
 * It walks the course, stops wherever the arms have a job to do, and says what
 * that job is (`hint`). It looks at the world afresh every step, so falling off
 * and respawning needs no special handling.
 */
export class Bots {
  legs = emptyLegs();
  head = emptyHead();
  special = emptySpecial();
  /** What the arms player should do right now ('' = nothing, just enjoy the ride). */
  hint = '';
  /** Machine-readable version of the hint, for tests. */
  task = '';
  /** In position: the arms can do their job now. */
  ready = false;
  private tick = 0;
  private atBalls = false;

  step(sim: Simulation) {
    this.tick++;
    const legs: LegsInput = (this.legs = emptyLegs());
    const head: HeadInput = (this.head = emptyHead());
    const special: SpecialInput = (this.special = emptySpecial());
    this.hint = '';
    this.task = 'walk';
    this.ready = false;

    const L = sim.level, m = sim.monster, p = m.pos, z = p.z;
    const at = (i: number) => sim.bodies[i].translation();
    const held = sim.arms.held;
    const heldTag = held >= 0 ? L.entities[held].tag : '';

    // --- ways of moving ---------------------------------------------------
    const go = (x: number, zz: number, stop = 0.25) => {
      const dx = x - p.x, dz = zz - p.z, d = Math.hypot(dx, dz);
      if (d < stop) return true;
      const s = Math.min(1, Math.max(0.3, d));
      legs.mx = (dx / d) * s;
      legs.mz = (dz / d) * s;
      return false;
    };
    /** Get onto the line x, then follow it to zz. */
    const lane = (x: number, zz: number) => {
      if (Math.abs(p.x - x) > 0.4) { go(x, p.z, 0.1); return false; }
      return go(x, zz);
    };
    /** Stop at a spot facing down the course (comes at it from behind so it ends up facing the right way). */
    const park = (x: number, zz: number) => {
      const inLane = Math.abs(p.x - x) < 0.4 && p.z > zz - 0.3;
      if (!inLane) { go(x, zz + 1.5, 0.2); return false; }
      if (!go(x, zz)) return false;
      if (Math.abs(angDiff(m.yaw, DOWN_COURSE)) > 0.3) { legs.mz = -0.2; return false; }
      return true;
    };
    /** Walk up to a loose object and stop with it just in front. */
    const approach = (x: number, zz: number) => {
      const dx = x - p.x, dz = zz - p.z, d = Math.hypot(dx, dz);
      if (d > REACH + 0.25) { go(x, zz, REACH); return false; }
      if (d > 0.3 && Math.abs(angDiff(m.yaw, Math.atan2(dx, dz))) > 0.4) {
        legs.mx = (dx / d) * 0.2;
        legs.mz = (dz / d) * 0.2;
        return false;
      }
      return true;
    };
    const nearest = (tag: string, ok: (t: { x: number; y: number; z: number }) => boolean) => {
      let best: { x: number; y: number; z: number } | null = null, bestD = Infinity;
      L.entities.forEach((e, i) => {
        if (e.tag !== tag || !sim.bodies[i].isEnabled()) return;
        const t = at(i);
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (ok(t) && d < bestD) { bestD = d; best = { x: t.x, y: t.y, z: t.z }; }
      });
      return best as { x: number; y: number; z: number } | null;
    };
    const aim = (x: number, zz: number) => {
      const dyaw = Math.atan2(x - p.x, -(zz - p.z)) - sim.head.yaw;
      const ddist = Math.hypot(x - p.x, zz - p.z) - sim.head.dist;
      head.lx = Math.abs(dyaw) > 0.04 ? Math.sign(dyaw) : 0;
      head.ly = Math.abs(ddist) > 0.2 ? Math.sign(ddist) : 0;
    };

    // Head, when it has nothing better to do: reveal a ghost star nearby, else look ahead.
    const star = L.ghostStars.map((i) => (sim.stars & (1 << i) ? null : L.stars[i]))
      .find((s) => s && Math.hypot(s[0] - p.x, s[2] - p.z) < 9);
    if (star) aim(star[0], star[2]);
    else aim(p.x, p.z - 5);

    if (sim.finished) return;
    if (z > -62) this.atBalls = false;
    if (z <= -68.8) this.atBalls = true;

    if (z > -21.2) {
      // --- crate wall, then the lever door ---------------------------------
      if (!sim.leverOn) {
        this.task = 'lever';
        this.ready = park(L.lever.pos[0], -17.4);
        this.hint = this.ready ? 'Reach up and pull the lever!' : 'Walking to the lever…';
      } else if (at(L.lever.door).y > -2) {
        this.hint = 'Nice! Door opening…';
      } else if (z > -18.5 && Math.abs(p.x) > 0.5) {
        go(0, -18, 0.2);
      } else {
        go(0, -23);
      }
    } else if (z > -33.8) {
      // --- crate onto the pressure plate, then over the bridge ---------------
      const pl = L.plate;
      const onPlate = L.entities.some((e, i) => {
        if (e.tag !== 'crate' || i === held) return false;
        const t = at(i);
        return Math.abs(t.x - pl.pos[0]) < pl.half && Math.abs(t.z - pl.pos[2]) < pl.half && t.y > 0 && t.y < 1.6;
      });
      if (onPlate) {
        if (at(pl.bridge).z > pl.zOut + 0.3) this.hint = 'Bridge coming out…';
        else lane(0, -36);
      } else if (heldTag === 'crate') {
        this.task = 'carry-crate';
        this.ready = park(pl.pos[0], pl.pos[2] + 2.6);
        this.hint = this.ready ? 'Drop it on the red plate!' : 'Carrying the crate to the plate…';
      } else {
        const c = nearest('crate', (t) => t.z < -21 && t.z > -34 && t.y > 0);
        if (c) {
          this.task = 'fetch-crate';
          this.ready = approach(c.x, c.z);
          this.hint = this.ready ? 'Lower the hand and grab the crate!' : 'Fetching a crate…';
        }
      }
    } else if (z > -42.3) {
      // --- end of the bridge: run and jump the gap ---------------------------
      legs.mz = -1;
      legs.mx = Math.max(-1, Math.min(1, -p.x));
      legs.jump = z < -38.3 && m.grounded;
    } else if (!this.atBalls) {
      // --- hammer alley: wait for each hammer to swing clear -----------------
      let wait = false;
      for (const h of L.hammers) {
        const hz = h.pivot[2];
        if (z > hz + 3.4 || z < hz + 2.0) continue;
        const th = sim.time * h.speed + h.phase;
        const hx = at(h.head).x;
        const movingAway = Math.sin(th) * Math.cos(th) > 0;
        wait = !(Math.abs(hx - p.x) > 2.4 && movingAway);
      }
      if (!wait) lane(0, -69.5);
    } else if (z > -78.6) {
      // --- ball toss -----------------------------------------------------------
      const t = L.target;
      if (sim.targetHit) {
        if (at(t.bridge).y > 0) this.hint = 'Bullseye! Bridge coming down…';
        else lane(0, -80);
      } else if (heldTag === 'ball') {
        this.task = 'carry-ball';
        this.ready = park(t.pos[0], -77);
        this.hint = this.ready ? 'Hold Throw to about half power, then let go!' : 'Lining up the shot…';
      } else {
        const b = nearest('ball', (q) => q.z < -60 && q.z > -78.5 && q.y > 0 && Math.abs(q.x) < 5);
        if (b) {
          this.task = 'fetch-ball';
          this.ready = approach(b.x, b.z);
          this.hint = this.ready ? 'Lower the hand and grab a ball!' : 'Fetching a ball…';
        }
      }
    } else if (z > -104.4) {
      // --- drawbridge, then roar the cracked wall down ---------------------------
      if (sim.wallBroken) {
        lane(0, -104.8);
      } else if (lane(0, -94.5)) {
        if (Math.abs(angDiff(m.yaw, DOWN_COURSE)) > 0.3) legs.mz = -0.2;
        else special.roar = this.tick % 30 < 2;
      }
    } else if (z > -130.6) {
      // --- ghost path: look at the next tile, step on once it is there ------------
      const tiles = L.ghosts.map((id) => L.entities[id].pos);
      const next = tiles.findIndex((t) => t[2] < z - 0.4);
      if (next < 0) {
        legs.mz = -1;
      } else {
        const t = tiles[next];
        aim(t[0], t[2]);
        if (sim.ghostT[next] > 0.5) {
          const dx = t[0] - p.x, dz = t[2] - z, d = Math.hypot(dx, dz);
          legs.mx = dx / d;
          legs.mz = dz / d;
        }
      }
    } else if (!sim.buttonDown) {
      // --- heavy button: jump, then stomp at the top -----------------------------
      const b = L.button.pos;
      const there = go(b[0], b[2], 0.4);
      if (there && m.grounded && sim.special.stompCd === 0) legs.jump = this.tick % 40 < 3;
      const over = Math.hypot(p.x - b[0], z - b[2]) < L.button.r - 0.3;
      special.stomp = over && !m.grounded && p.y > MONSTER_Y + 1 && m.vy < 3;
    } else if (at(L.button.gate).y > -2) {
      this.hint = 'Gate opening…';
    } else {
      lane(0, L.finishZ - 2);
    }
  }
}
