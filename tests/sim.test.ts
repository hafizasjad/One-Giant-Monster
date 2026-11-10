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

  it('a ball on the target drops the drawbridge and the monster can finish', () => {
    const sim = make();
    const { target } = sim.level;
    const ball = sim.level.entities.findIndex((e) => e.tag === 'ball');
    sim.bodies[ball].setTranslation({ x: target.pos[0], y: target.pos[1], z: target.pos[2] }, true);
    run(sim, 200);
    expect(sim.targetHit).toBe(true);

    sim.monster.teleport([0, MONSTER_Y, -76]);
    run(sim, 20);
    run(sim, 300, (i) => { i.legs.mz = -1; });
    expect(sim.finished).toBe(true);
    expect(sim.finalScore).toBeGreaterThan(0);
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
