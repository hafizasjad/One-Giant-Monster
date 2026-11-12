import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { emptyInputs, type Inputs } from '../shared/protocol.ts';
import { buildLevel, MONSTER_Y } from '../src/game/level1.ts';
import { buildLevel2 } from '../src/game/level2.ts';
import { buildLevel3 } from '../src/game/level3.ts';
import { buildLevel4 } from '../src/game/level4.ts';
import { buildHub, hubDoorAt, hubDoorX } from '../src/game/hub.ts';
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

describe('level 3: Frozen Flop', () => {
  const make3 = () => new Simulation(RAPIER, { chaos: false, level: buildLevel3() });
  /** Walk to a point the way a careful player would on ice: ease off near the target. */
  function steer(sim: Simulation, x: number, z: number, steps = 400) {
    for (let n = 0; n < steps; n++) {
      const m = sim.monster;
      const dx = x - m.pos.x, dz = z - m.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.6 && m.speed < 1) return;
      // aim at where we want to be, minus where the slide is already taking us
      const wx = dx * 1.2 - m.vel.x * 0.9, wz = dz * 1.2 - m.vel.z * 0.9, w = Math.max(1, Math.hypot(wx, wz));
      run(sim, 1, (i) => { i.legs.mx = wx / w; i.legs.mz = wz / w; });
    }
  }

  it('the monster keeps sliding on ice but stops quickly on snow', () => {
    const slide = (z: number) => {
      const sim = make3();
      sim.monster.teleport([0, MONSTER_Y, z]);
      run(sim, 20);
      run(sim, 40, (i) => { i.legs.mx = 1; });
      run(sim, 4, (i) => { i.legs.mx = -1; }); // tap the other way
      const icy = sim.monster.icy;
      const x0 = sim.monster.pos.x;
      run(sim, 30);
      return { icy, drift: sim.monster.pos.x - x0 };
    };
    const snow = slide(2), ice = slide(-20);
    expect(snow.icy).toBe(false);
    expect(ice.icy).toBe(true);
    expect(snow.drift).toBeLessThan(0.3);
    expect(ice.drift).toBeGreaterThan(0.6);
  });

  it('crates slide a long way on ice', () => {
    const sim = make3();
    const crate = sim.level.entities.findIndex((e) => e.tag === 'crate' && e.pos[2] === -73);
    run(sim, 30);
    sim.bodies[crate].setLinvel({ x: 0, y: 0, z: -5 }, true);
    run(sim, 120);
    expect(sim.bodies[crate].translation().z).toBeLessThan(-80);
  });

  it('sliding into the wall under the lever leaves it within reach', () => {
    const sim = make3();
    const lv = sim.level.levers[0];
    sim.monster.teleport([lv.pos[0], MONSTER_Y, -20]);
    run(sim, 20);
    run(sim, 150, (i) => { i.legs.mz = -1; i.arms.ay = 1; });
    tapGrab(sim);
    expect(sim.levers[0]).toBe(true);
    run(sim, 120);
    steer(sim, 0, -24);
    run(sim, 200, (i) => { i.legs.mz = -1; i.legs.mx = -sim.monster.pos.x; });
    expect(sim.monster.pos.z).toBeLessThan(-31);
    expect(sim.cp).toBe(0);
  });

  it('the narrow ice zigzag can be crossed with careful steering', () => {
    const sim = make3();
    sim.monster.teleport([0, MONSTER_Y, -33]);
    run(sim, 20);
    for (const [x, z] of [[-0.9, -41], [0, -46], [0.9, -51], [0, -56], [0, -61], [0, -66]]) steer(sim, x, z);
    expect(sim.fumbles).toBe(0);
    expect(sim.monster.pos.z).toBeLessThan(-64);
    expect(sim.cp).toBe(1);
  });

  it('a crate slid into the pocket stays on the plate and holds the bridge out', () => {
    const sim = make3();
    const plate = sim.level.plates[0];
    const crate = sim.level.entities.findIndex((e) => e.tag === 'crate' && e.pos[2] === -73);
    run(sim, 30);
    sim.bodies[crate].setTranslation({ x: 0, y: 0.6, z: -78 }, true);
    sim.bodies[crate].setLinvel({ x: 0, y: 0, z: -6 }, true);
    run(sim, 300);
    expect(sim.plates[0]).toBe(true);
    expect(sim.bodies[plate.bridge].translation().z).toBeCloseTo(plate.zOut, 1);

    // round the pocket, onto the bridge, jump the gap
    sim.monster.teleport([3.4, MONSTER_Y, -80]);
    run(sim, 20);
    steer(sim, 3.4, -87);
    steer(sim, 0.5, -90.5);
    run(sim, 150, (i) => { i.legs.mz = sim.monster.pos.z > -99.5 ? -1 : 0; i.legs.mx = -sim.monster.pos.x; i.legs.jump = sim.monster.pos.z < -94.3; });
    expect(sim.monster.pos.z).toBeLessThan(-98.5);
    expect(sim.fumbles).toBe(0);
    expect(sim.cp).toBe(2);
  });

  it('a throw from the ice hits the target, and the drawbridge leads to the finish', () => {
    let hit = -1;
    for (let frames = 12; frames <= 54 && hit < 0; frames += 3) {
      const sim = make3();
      const tg = sim.level.targets[0];
      const ball = sim.level.entities.findIndex((e) => e.tag === 'ball');
      sim.monster.teleport([tg.pos[0], MONSTER_Y, -108]);
      run(sim, 10);
      run(sim, 25, (i) => { i.legs.mz = -0.5; });
      run(sim, 60); // let the slide die down
      if (sim.monster.pos.z < -111.5) continue;
      const h = sim.arms.pos;
      sim.bodies[ball].setTranslation({ x: h.x, y: h.y, z: h.z }, true);
      tapGrab(sim);
      run(sim, frames, (i) => { i.arms.throw = true; });
      run(sim, 120);
      if (!sim.targets[0]) continue;
      hit = frames;
      run(sim, 200);
      steer(sim, 0, -110);
      run(sim, 400, (i) => { i.legs.mz = sim.finished ? 0 : -1; i.legs.mx = -sim.monster.pos.x; });
      expect(sim.finished).toBe(true);
      expect(sim.fumbles).toBe(0);
    }
    expect(hit, 'some throw strength hits the target').toBeGreaterThan(0);
  });
});

describe('level 4: Lift Off', () => {
  const make4 = () => new Simulation(RAPIER, { chaos: false, level: buildLevel4() });
  const moverPos = (sim: Simulation, n: number) => sim.bodies[sim.level.movers[n].id].translation();
  /** Step until a condition holds. */
  function until(sim: Simulation, cond: () => boolean, edit?: (i: Inputs) => void, max = 900) {
    for (let n = 0; n < max && !cond(); n++) run(sim, 1, edit);
    return cond();
  }

  it('the ferry carries a standing monster across the first gap', () => {
    const sim = make4();
    sim.monster.teleport([0, MONSTER_Y, -8]);
    run(sim, 20);
    expect(until(sim, () => moverPos(sim, 0).z > -12.7)).toBe(true); // ferry at the near side
    run(sim, 25, (i) => { i.legs.mz = -1; });                          // step on
    const z0 = sim.monster.pos.z;
    expect(until(sim, () => moverPos(sim, 0).z < -19.3)).toBe(true);  // ride without touching anything
    expect(sim.monster.pos.z).toBeLessThan(z0 - 6);
    expect(sim.monster.grounded).toBe(true);
    run(sim, 90, (i) => { i.legs.mz = -1; });                          // step off
    expect(sim.monster.pos.z).toBeLessThan(-22);
    expect(sim.fumbles).toBe(0);
    expect(sim.cp).toBe(0);
  });

  it('the sideways platforms can be crossed by hopping over when they line up', () => {
    const sim = make4();
    sim.monster.teleport([0, MONSTER_Y, -32.5]);
    run(sim, 20);
    for (const n of [1, 2, 3]) {
      // wait until the next platform is straight ahead, then walk onto its middle
      expect(until(sim, () => Math.abs(moverPos(sim, n).x - sim.monster.pos.x) < 0.5)).toBe(true);
      const z = sim.level.movers[n].a[2];
      // hop the gap, steering to stay over the platform as it slides
      until(sim, () => sim.monster.pos.z < z, (i) => {
        i.legs.mz = -1;
        i.legs.mx = Math.max(-1, Math.min(1, moverPos(sim, n).x - sim.monster.pos.x));
        i.legs.jump = sim.monster.pos.z < z + 3.2 && sim.monster.pos.z > z + 2.6;
      }, 90);
      run(sim, 6);
    }
    const x0 = sim.monster.pos.x;
    run(sim, 40);
    expect(Math.abs(sim.monster.pos.x - x0)).toBeGreaterThan(0.5); // carried sideways
    until(sim, () => Math.abs(sim.monster.pos.x) < 3, undefined, 300);
    run(sim, 60, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-49.5);
    expect(sim.fumbles).toBe(0);
    expect(sim.cp).toBe(1);
  });

  it('pulling the lever from the lift takes the monster to the top deck, and the lift comes back down', () => {
    const sim = make4();
    sim.monster.teleport([1, MONSTER_Y, -63.6]);
    run(sim, 20);
    run(sim, 60, (i) => { i.arms.ay = 1; i.arms.ax = 1; });
    tapGrab(sim);
    expect(sim.levers[0]).toBe(true);
    run(sim, 180);
    expect(sim.monster.pos.y).toBeCloseTo(5 + MONSTER_Y, 0);
    expect(sim.monster.grounded).toBe(true);
    run(sim, 90, (i) => { i.legs.mz = -1; });
    expect(sim.monster.pos.z).toBeLessThan(-67.5);
    expect(sim.monster.pos.y).toBeGreaterThan(6);
    expect(sim.cp).toBe(2);
    run(sim, 400); // left empty at the top: goes back down
    expect(sim.levers[0]).toBe(false);
    expect(moverPos(sim, 4).y).toBeCloseTo(-0.2, 1);
    expect(sim.fumbles).toBe(0);
  });

  it('a throw from the top deck hits the target, and the drawbridge leads to the finish', () => {
    let hit = -1;
    for (let frames = 12; frames <= 54 && hit < 0; frames += 3) {
      const sim = make4();
      const tg = sim.level.targets[0];
      const ball = sim.level.entities.findIndex((e) => e.tag === 'ball');
      sim.monster.teleport([tg.pos[0], 5 + MONSTER_Y, -77.5]);
      run(sim, 10);
      run(sim, 40, (i) => { i.legs.mz = -0.6; });
      const h = sim.arms.pos;
      sim.bodies[ball].setTranslation({ x: h.x, y: h.y, z: h.z }, true);
      tapGrab(sim);
      run(sim, frames, (i) => { i.arms.throw = true; });
      run(sim, 120);
      if (!sim.targets[0]) continue;
      hit = frames;
      run(sim, 200);
      run(sim, 60, (i) => { i.legs.mx = -1; });
      run(sim, 400, (i) => { i.legs.mz = sim.finished ? 0 : -1; i.legs.mx = -sim.monster.pos.x; });
      expect(sim.finished).toBe(true);
      expect(sim.fumbles).toBe(0);
    }
    expect(hit, 'some throw strength hits the target').toBeGreaterThan(0);
  });
});

describe('the hub', () => {
  const doors = [0, 1, 2, 3].map((i) => ({ name: `Level ${i}`, open: i < 2, note: '' }));

  it('lets the monster walk into a door and never finishes', () => {
    const sim = new Simulation(RAPIER, { chaos: false, level: buildHub(doors) });
    const x = hubDoorX(1, 4);
    run(sim, 20);
    expect(hubDoorAt(sim.monster.pos.x, sim.monster.pos.z, 4)).toBe(-1);
    let entered = -1;
    for (let n = 0; n < 600 && entered < 0; n++) {
      run(sim, 1, (i) => { i.legs.mz = -1; i.legs.mx = Math.max(-1, Math.min(1, x - sim.monster.pos.x)); });
      entered = hubDoorAt(sim.monster.pos.x, sim.monster.pos.z, 4);
    }
    expect(entered).toBe(1);
    run(sim, 200, (i) => { i.legs.mz = -1; }); // keep pushing: the doorway is a dead end
    expect(sim.finished).toBe(false);
    expect(sim.fumbles).toBe(0);
  });

  it('walking between two doors enters neither', () => {
    const mid = (hubDoorX(1, 4) + hubDoorX(2, 4)) / 2;
    for (let z = 4; z > -14; z -= 0.5) expect(hubDoorAt(mid, z, 4)).toBe(-1);
  });
});
