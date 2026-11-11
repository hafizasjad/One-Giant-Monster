import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { emptyInputs, type Inputs } from '../shared/protocol.ts';
import { buildLevel, MONSTER_Y } from '../src/game/level1.ts';
import { buildLevel2 } from '../src/game/level2.ts';
import { LEVELS } from '../src/game/levels.ts';
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
    const doorBody = sim.bodies[sim.level.levers[0].door];
    sim.monster.teleport([3.2, MONSTER_Y, -17.4]);
    run(sim, 20);
    run(sim, 60, (i) => { i.arms.ay = 1; });
    tapGrab(sim);
    expect(sim.levers[0]).toBe(true);
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
    const plate = sim.level.plates[0];
    const crate = sim.level.entities.findIndex((e) => e.tag === 'crate' && e.pos[2] === -27);
    sim.bodies[crate].setTranslation({ x: plate.pos[0], y: 0.7, z: plate.pos[2] }, true);
    run(sim, 150);
    expect(sim.plates[0]).toBe(true);
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
    const target = sim.level.targets[0];
    const ball = sim.level.entities.findIndex((e) => e.tag === 'ball');
    sim.bodies[ball].setTranslation({ x: target.pos[0], y: target.pos[1], z: target.pos[2] }, true);
    run(sim, 200);
    expect(sim.targets[0]).toBe(true);

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

describe('levels', () => {
  it('every level in the list builds, runs and snapshots', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const info of LEVELS) {
      const level = info.build();
      const sim = new Simulation(RAPIER, { chaos: false, level });
      run(sim, 30);
      const snap = sim.snapshot();
      expect(sim.monster.grounded, info.name).toBe(true);
      expect(snap.s.length).toBe(level.levers.length + level.plates.length + level.targets.length);
      expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
      sim.dispose();
    }
  });

  it('a level can have several levers, each with its own door', () => {
    // Level 1 plus a second door right at the start, with its own lever.
    const level = buildLevel();
    const door2 = level.entities.push({ shape: 'box', half: [1.6, 2.2, 0.3], pos: [0, 2.2, -3], body: 'kinematic', color: 0xff5d73, tag: 'door' }) - 1;
    level.movable.push(door2);
    level.levers.push({ pos: [3.2, 3.2, -2.3], door: door2, closedY: 2.2, openY: -2.45 });

    const sim = new Simulation(RAPIER, { chaos: false, level });
    sim.monster.teleport([3.2, MONSTER_Y, -0.4]);
    run(sim, 20);
    run(sim, 60, (i) => { i.arms.ay = 1; });
    tapGrab(sim);
    expect(sim.levers).toEqual([false, true]);
    run(sim, 120);
    expect(sim.bodies[door2].translation().y).toBeLessThan(-2);
    expect(sim.bodies[level.levers[0].door].translation().y).toBeGreaterThan(2); // the other door stays shut
    expect(sim.snapshot().s).toEqual([0, 1, 0, 0]);
  });
});

describe('level 2: Double Trouble', () => {
  const make2 = () => new Simulation(RAPIER, { chaos: false, level: buildLevel2() });
  /** Stand under a lever, raise the hand and pull. */
  function pull(sim: Simulation, lever: number) {
    const lv = sim.level.levers[lever];
    sim.monster.teleport([lv.pos[0], MONSTER_Y, lv.pos[2] + 1.9]);
    run(sim, 20);
    run(sim, 60, (i) => { i.arms.ay = 1; });
    tapGrab(sim);
    run(sim, 120);
  }

  it('each of the three levers opens only its own door', () => {
    const sim = make2();
    const doorY = (n: number) => sim.bodies[sim.level.levers[n].door].translation().y;
    pull(sim, 0);
    expect(sim.levers).toEqual([true, false, false]);
    expect([doorY(0) < -2, doorY(1) > 2, doorY(2) > 2]).toEqual([true, true, true]);

    // through door 1, then stopped by door 2
    sim.monster.teleport([0, MONSTER_Y, -6]);
    run(sim, 200, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-12);
    expect(sim.monster.pos.z).toBeGreaterThan(-17.5);

    pull(sim, 1);
    sim.monster.teleport([0, MONSTER_Y, -14]);
    run(sim, 100, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-20);
    expect(sim.cp).toBe(0);

    pull(sim, 2);
    sim.monster.teleport([0, MONSTER_Y, -61]);
    run(sim, 100, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-66);
  });

  it('a carried crate fits through a door and onto the plate, which bridges the gap', () => {
    const sim = make2();
    const plate = sim.level.plates[0];
    pull(sim, 0);
    // pick up the crate at the start and walk it through door 1
    sim.monster.teleport([2.5, MONSTER_Y, -0.6]);
    run(sim, 20);
    // hover the hand just above the crate (pressing down onto it would shove it away)
    run(sim, 60, (i) => { i.arms.ay = sim.arms.local.y > 1.5 ? -1 : 0; i.arms.reach = sim.arms.local.f < 2.4 ? 1 : 0; });
    tapGrab(sim);
    const crate = sim.arms.held;
    expect(sim.level.entities[crate]?.tag).toBe('crate');
    run(sim, 40, (i) => { i.arms.ay = 1; });
    run(sim, 60, (i) => { i.legs.mx = -1; });
    run(sim, 200, (i) => { i.legs.mx = Math.abs(sim.monster.pos.x) > 0.3 ? -Math.sign(sim.monster.pos.x) : 0; i.legs.mz = -1; });
    expect(sim.arms.held).toBe(crate); // still holding it on the far side of door 1
    expect(sim.monster.pos.z).toBeLessThan(-12);

    // let go, then put it on the plate (door 2 is tested above)
    tapGrab(sim);
    expect(sim.arms.held).toBe(-1);
    sim.bodies[crate].setTranslation({ x: plate.pos[0], y: 0.7, z: plate.pos[2] }, true);
    run(sim, 150);
    expect(sim.plates[0]).toBe(true);
    expect(sim.bodies[plate.bridge].translation().z).toBeCloseTo(plate.zOut, 1);

    sim.monster.teleport([0, MONSTER_Y, -29]);
    run(sim, 20);
    run(sim, 150, (i) => { i.legs.mz = sim.monster.pos.z > -40 ? -1 : 0; i.legs.jump = sim.monster.pos.z < -34.3; });
    expect(sim.monster.pos.z).toBeLessThan(-38.5);
    expect(sim.fumbles).toBe(0);
    expect(sim.cp).toBe(1);
  });

  it('two targets drop two drawbridges, and the far balls stay put until needed', () => {
    const sim = make2();
    const [t1, t2] = sim.level.targets;
    const balls = sim.level.entities.map((e, i) => (e.tag === 'ball' ? i : -1)).filter((i) => i >= 0);
    const islandBall = balls.find((i) => sim.level.entities[i].pos[2] < -80)!;
    run(sim, 240);
    // island balls must not be treated as stranded while target 1 is still up
    expect(sim.bodies[islandBall].translation().z).toBeCloseTo(sim.level.entities[islandBall].pos[2], 0);
    expect(sim.bodies[islandBall].translation().y).toBeLessThan(1);

    sim.bodies[balls[0]].setTranslation({ x: t1.pos[0], y: t1.pos[1], z: t1.pos[2] }, true);
    run(sim, 200);
    expect(sim.targets).toEqual([true, false]);
    sim.monster.teleport([0, MONSTER_Y, -74]);
    run(sim, 20);
    run(sim, 300, (i) => { i.legs.mz = sim.monster.pos.z > -90 ? -1 : 0; });
    expect(sim.monster.pos.z).toBeLessThan(-86);
    expect(sim.cp).toBe(3);
    expect(sim.finished).toBe(false);

    sim.bodies[islandBall].setTranslation({ x: t2.pos[0], y: t2.pos[1], z: t2.pos[2] }, true);
    run(sim, 200);
    expect(sim.targets).toEqual([true, true]);
    run(sim, 400, (i) => { i.legs.mz = sim.finished ? 0 : -1; });
    expect(sim.finished).toBe(true);
    expect(sim.fumbles).toBe(0);
  });

  it('a real throw from the edge can hit each target', () => {
    // Find a charge that works from the natural standing spot, like a player would.
    for (const n of [0, 1]) {
      let hit = -1;
      for (let frames = 12; frames <= 54 && hit < 0; frames += 3) {
        const sim = make2();
        const tg = sim.level.targets[n];
        const ball = sim.level.entities.findIndex((e) => e.tag === 'ball' && e.pos[2] > tg.strandedZ && e.pos[2] < tg.strandedZ + 12);
        const standZ = tg.hinge[2] + 8 + 1; // one step back from the edge of the pit
        sim.monster.teleport([tg.pos[0], MONSTER_Y, standZ + 1.5]);
        run(sim, 10);
        run(sim, 40, (i) => { i.legs.mz = -0.6; }); // step forward so it faces the target
        const h = sim.arms.pos;
        sim.bodies[ball].setTranslation({ x: h.x, y: h.y, z: h.z }, true);
        tapGrab(sim);
        if (sim.arms.held !== ball) continue;
        run(sim, frames, (i) => { i.arms.throw = true; });
        run(sim, 120);
        if (sim.targets[n]) hit = frames;
      }
      expect(hit, `target ${n + 1} can be hit`).toBeGreaterThan(0);
    }
  });
});
