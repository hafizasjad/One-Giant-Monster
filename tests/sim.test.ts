import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { emptyInputs, type Inputs } from '../shared/protocol.ts';
import { MONSTER_Y } from '../src/game/level1.ts';
import { Simulation } from '../src/game/Simulation.ts';

beforeAll(async () => {
  await RAPIER.init();
});

const make = () => new Simulation(RAPIER, { chaos: false });
function run(sim: Simulation, steps: number, edit?: (i: Inputs, n: number) => void) {
  for (let n = 0; n < steps; n++) {
    const i = emptyInputs();
    edit?.(i, n);
    sim.step(i);
  }
}
/** Tap grab for one step. */
const tapGrab = (sim: Simulation) => run(sim, 2, (i, n) => { i.arms.grab = n === 0; });

describe('legs', () => {
  it('settles on the ground, walks forward and jumps', () => {
    const sim = make();
    run(sim, 30);
    expect(sim.monster.grounded).toBe(true);
    expect(sim.monster.pos.y).toBeCloseTo(MONSTER_Y, 0);

    const z0 = sim.monster.pos.z;
    run(sim, 60, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(z0 - 4);

    const y0 = sim.monster.pos.y;
    run(sim, 15, (i) => { i.legs.jump = true; });
    expect(sim.monster.pos.y).toBeGreaterThan(y0 + 1);
    run(sim, 90);
    expect(sim.monster.grounded).toBe(true);
  });

  it('pushes through the crate wall', () => {
    const sim = make();
    run(sim, 400, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-12);
  });

  it('respawns and counts a fumble after falling off', () => {
    const sim = make();
    for (let n = 0; n < 400 && sim.fumbles === 0; n++) run(sim, 1, (i) => { i.legs.mx = 1; });
    expect(sim.fumbles).toBe(1);
    run(sim, 30);
    expect(sim.monster.pos.y).toBeGreaterThan(0);
  });
});

describe('arms', () => {
  it('grabs a crate, carries it, and throws it', () => {
    const sim = make();
    sim.monster.teleport([2.5, MONSTER_Y, -24.6]);
    run(sim, 20);
    run(sim, 60, (i) => { i.arms.ay = -1; i.arms.reach = 1; }); // hand down and out, onto the crate
    tapGrab(sim);
    const crate = sim.arms.held;
    expect(sim.level.entities[crate]?.tag).toBe('crate');

    run(sim, 60, (i) => { i.arms.ay = 1; });
    expect(sim.bodies[crate].translation().y).toBeGreaterThan(1.5);

    run(sim, 40, (i) => { i.arms.throw = true; });
    run(sim, 3);
    expect(sim.arms.held).toBe(-1);
    const v = sim.bodies[crate].linvel();
    expect(v.z).toBeLessThan(-8); // flying forward (-Z)
    expect(v.y).toBeGreaterThan(2);
  });

  it('pulls the lever to open the door', () => {
    const sim = make();
    const doorBody = sim.bodies[sim.level.lever.door];
    sim.monster.teleport([3.2, MONSTER_Y, -17.4]);
    run(sim, 20);
    run(sim, 60, (i) => { i.arms.ay = 1; });
    tapGrab(sim);
    expect(sim.leverOn).toBe(true);
    run(sim, 120);
    expect(doorBody.translation().y).toBeLessThan(-2);

    // and the monster can now walk through
    sim.monster.teleport([0, MONSTER_Y, -17]);
    run(sim, 120, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-22);
    expect(sim.cp).toBe(0);
  });
});

describe('course', () => {
  it('extends the bridge while a crate is on the plate', () => {
    const sim = make();
    const { plate } = sim.level;
    const crate = sim.level.entities.findIndex((e) => e.tag === 'crate' && e.pos[2] === -27);
    sim.bodies[crate].setTranslation({ x: plate.pos[0], y: 0.7, z: plate.pos[2] }, true);
    run(sim, 150);
    expect(sim.plateDown).toBe(true);
    expect(sim.bodies[plate.bridge].translation().z).toBeCloseTo(plate.zOut, 1);

    // cross: walk over the bridge and jump the remaining gap
    sim.monster.teleport([0, MONSTER_Y, -33]);
    run(sim, 20);
    run(sim, 150, (i) => { i.legs.mz = -1; i.legs.jump = sim.monster.pos.z < -38.3; });
    expect(sim.monster.pos.z).toBeLessThan(-42);
    expect(sim.fumbles).toBe(0);
  });

  it('a ball on the target drops the drawbridge and the monster can cross', () => {
    const sim = make();
    const { target } = sim.level;
    const ball = sim.level.entities.findIndex((e) => e.tag === 'ball');
    sim.bodies[ball].setTranslation({ x: target.pos[0], y: target.pos[1], z: target.pos[2] }, true);
    run(sim, 200);
    expect(sim.targetHit).toBe(true);

    sim.monster.teleport([0, MONSTER_Y, -76]);
    run(sim, 20);
    run(sim, 300, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-90);
    expect(sim.cp).toBe(3);
    expect(sim.finished).toBe(false); // the cracked wall is still in the way
  });

  it('hammers knock the monster about', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -50]);
    let bonked = false;
    for (let n = 0; n < 300 && !bonked; n++) {
      sim.step(emptyInputs());
      bonked = sim.drainEvents().some((e) => e.k === 'bonk');
    }
    expect(bonked).toBe(true);
  });

  it('snapshots survive a JSON round trip', () => {
    const sim = make();
    run(sim, 10);
    const snap = sim.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.b.length).toBe(sim.level.movable.length * 7);
  });
});

/** Steer the gaze at a point, the way a Head player would. */
function aim(sim: Simulation, i: Inputs, x: number, z: number) {
  const m = sim.monster.pos;
  const dyaw = Math.atan2(x - m.x, -(z - m.z)) - sim.head.yaw;
  const ddist = Math.hypot(x - m.x, z - m.z) - sim.head.dist;
  i.head.lx = Math.abs(dyaw) > 0.04 ? Math.sign(dyaw) : 0;
  i.head.ly = Math.abs(ddist) > 0.2 ? Math.sign(ddist) : 0;
}

/** Head looks at the next ghost tile, legs only step onto tiles that are there. */
function crossGhosts(sim: Simulation, maxSteps = 1500) {
  const tiles = sim.level.ghosts.map((id) => sim.level.entities[id].pos);
  for (let n = 0; n < maxSteps && sim.monster.pos.z > -131; n++) {
    const i = emptyInputs();
    const m = sim.monster.pos;
    const next = tiles.findIndex((t) => t[2] < m.z - 0.4);
    if (next < 0) {
      i.legs.mz = -1;
    } else {
      const t = tiles[next];
      aim(sim, i, t[0], t[2]);
      if (sim.ghostT[next] > 0.5) {
        const dx = t[0] - m.x, dz = t[2] - m.z, d = Math.hypot(dx, dz);
        i.legs.mx = dx / d;
        i.legs.mz = dz / d;
      }
    }
    sim.step(i);
  }
}

describe('head', () => {
  it('ghost platforms are not there unless the head looks at them', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -104]);
    run(sim, 120, (i) => { i.head.ly = 1; }); // stare far into the distance
    expect(sim.bodies[sim.level.ghosts[0]].isEnabled()).toBe(false);
    for (let n = 0; n < 300 && sim.fumbles === 0; n++) run(sim, 1, (i) => { i.legs.mz = -1; });
    expect(sim.fumbles).toBe(1);
  });

  it('looking makes a ghost platform solid, and it fades after the gaze leaves', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -104]);
    const t0 = sim.level.entities[sim.level.ghosts[0]].pos;
    run(sim, 90, (i) => aim(sim, i, t0[0], t0[2]));
    expect(sim.bodies[sim.level.ghosts[0]].isEnabled()).toBe(true);
    expect(sim.snapshot().gh[0]).toBe(1);
    run(sim, 150, (i) => { i.head.ly = 1; });
    expect(sim.bodies[sim.level.ghosts[0]].isEnabled()).toBe(false);
  });

  it('with the head leading, the monster crosses the ghost path', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -104]);
    run(sim, 10);
    crossGhosts(sim);
    expect(sim.fumbles).toBe(0);
    expect(sim.monster.pos.z).toBeLessThan(-131);
    expect(sim.stars & (1 << 12)).toBeTruthy(); // the ghost star on the path
  });
});

describe('special', () => {
  it('roar shoves loose crates away and goes on cooldown', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -5.5]);
    run(sim, 20);
    const crate = sim.level.entities.findIndex((e) => e.tag === 'crate');
    run(sim, 2, (i, n) => { i.special.roar = n === 0; });
    expect(sim.bodies[crate].linvel().z).toBeLessThan(-5);
    expect(sim.special.roarCd).toBeGreaterThan(3);
    expect(sim.wallBroken).toBe(false); // far too far away
  });

  it('roar shatters the cracked wall so the monster can walk through', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -94]);
    run(sim, 90, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeGreaterThan(-98); // blocked
    run(sim, 2, (i, n) => { i.special.roar = n === 0; });
    expect(sim.wallBroken).toBe(true);
    run(sim, 90, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-101);
  });

  it('only a stomp from mid-air presses the heavy button', () => {
    const sim = make();
    const b = sim.level.button;
    sim.monster.teleport([b.pos[0], MONSTER_Y, b.pos[2]]);
    run(sim, 20);
    run(sim, 2, (i, n) => { i.special.stomp = n === 0; }); // from the ground: just a little hop
    run(sim, 90);
    expect(sim.buttonDown).toBe(false);
    run(sim, 200); // cooldown

    run(sim, 12, (i) => { i.legs.jump = true; });
    expect(sim.monster.grounded).toBe(false);
    run(sim, 2, (i, n) => { i.special.stomp = n === 0; });
    run(sim, 60);
    expect(sim.buttonDown).toBe(true);
    run(sim, 120);
    expect(sim.bodies[b.gate].translation().y).toBeLessThan(-2);
  });
});

describe('whole new stretch', () => {
  it('roar, ghost path, stomp, finish', () => {
    const sim = make();
    sim.monster.teleport([0, MONSTER_Y, -94]);
    run(sim, 20);
    run(sim, 2, (i, n) => { i.special.roar = n === 0; });
    run(sim, 200, (i) => { i.legs.mz = sim.monster.pos.z > -104 ? -1 : 0; });
    crossGhosts(sim);
    run(sim, 200, (i) => {
      i.legs.mz = sim.monster.pos.z > -138 ? -1 : 0;
      i.legs.mx = Math.abs(sim.monster.pos.x) > 0.2 ? -Math.sign(sim.monster.pos.x) : 0;
    });
    run(sim, 12, (i) => { i.legs.jump = true; });
    run(sim, 2, (i, n) => { i.special.stomp = n === 0; });
    run(sim, 150);
    run(sim, 300, (i) => { i.legs.mz = sim.finished ? 0 : -1; });
    expect(sim.finished).toBe(true);
    expect(sim.finalScore).toBeGreaterThan(0);
    expect(sim.fumbles).toBe(0);
  });
});
