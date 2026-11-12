// Level 2, "Double Trouble": the same toys as level 1, but two (or three) of everything.
// Carry a crate through two lever doors, cross hammers and boulders to a third lever,
// then hit two targets from two islands. The course runs along -Z.
import { MONSTER_Y, type EntityDef, type HammerDef, type LevelDef, type V3 } from './level1.ts';

const CRATE = { density: 0.35, restitution: 0.35, friction: 0.6 } as const;
const WALL = 0x8d7bd8, DOOR = 0xff5d73;

export function buildLevel2(): LevelDef {
  const entities: EntityDef[] = [];
  const add = (e: EntityDef) => entities.push(e) - 1;
  const ground = (zFrom: number, zTo: number, color: number) =>
    add({ shape: 'box', half: [5, 0.5, (zFrom - zTo) / 2], pos: [0, -0.5, (zFrom + zTo) / 2], body: 'fixed', color, tag: 'ground' });
  /** A wall across the course with a door in the middle and a lever on one side (+1 right, -1 left). */
  const leverDoor = (z: number, side: 1 | -1) => {
    add({ shape: 'box', half: [1.7, 2.2, 0.4], pos: [-3.3, 2.2, z], body: 'fixed', color: WALL, tag: 'wall' });
    add({ shape: 'box', half: [1.7, 2.2, 0.4], pos: [3.3, 2.2, z], body: 'fixed', color: WALL, tag: 'wall' });
    const door = add({ shape: 'box', half: [1.6, 2.2, 0.3], pos: [0, 2.2, z], body: 'kinematic', color: DOOR, tag: 'door' });
    return { pos: [side * 3.2, 3.2, z + 0.7] as V3, door, closedY: 2.2, openY: -2.45 };
  };

  // --- Ground: start, hammer alley, a small island, the finish --------------
  ground(8, -30, 0xffc9a8);
  ground(-38, -76, 0xb8e986);
  ground(-84, -94, 0xd6b3ff);
  ground(-102, -116, 0x9fd8ff);

  // --- 1. Two crates to carry, two doors with levers on opposite sides ---------
  add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [2.5, 0.6, -3], body: 'dynamic', color: 0x4dd0e1, tag: 'crate', ...CRATE });
  add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [-2.5, 0.6, -4], body: 'dynamic', color: 0x4dd0e1, tag: 'crate', ...CRATE });
  const lever1 = leverDoor(-10, 1);
  const lever2 = leverDoor(-18, -1);

  // --- 2. Pressure plate + sliding bridge: the crate has to come all this way ---
  const bridge = add({ shape: 'box', half: [2, 0.2, 2.5], pos: [0, -0.25, -27.4], body: 'kinematic', color: 0xb388ff, tag: 'bridge' });

  // --- 3. Hammers and boulders, then a third lever door --------------------------
  const hammers: HammerDef[] = [];
  [-44, -49, -54].forEach((z, i) => {
    const head = add({ shape: 'box', half: [0.9, 0.9, 0.7], pos: [0, 2, z], body: 'kinematic', color: 0xe63946, tag: 'hammer' });
    hammers.push({ head, pivot: [0, 7.2, z], len: 5.2, amp: 1.15, speed: [2.1, 1.7, 2.3][i], phase: i * 1.7 });
  });
  const boulderIds = [0, 1, 2].map((i) =>
    add({ shape: 'ball', half: [0.8, 0.8, 0.8], pos: [i * 3, -60, -59], body: 'dynamic', color: 0x7d6b5d, tag: 'boulder', density: 1.2, restitution: 0.3, friction: 0.8 }));
  const lever3 = leverDoor(-64, 1);

  // --- 4. Two targets: one from the mainland, one from the island ----------------
  const ball = (x: number, z: number) =>
    add({ shape: 'ball', half: [0.45, 0.45, 0.45], pos: [x, 0.5, z], body: 'dynamic', color: 0xff4fa3, tag: 'ball', density: 0.6, restitution: 0.6, friction: 0.5 });
  [-3, -1, 1, 3].forEach((x) => ball(x, -70));
  [-2, 0, 2].forEach((x) => ball(x, -88));
  const drawbridge = (hingeZ: number) =>
    add({ shape: 'box', half: [2, 0.2, 4], pos: [0, 3.8, hingeZ], body: 'kinematic', color: 0xc98b4b, tag: 'drawbridge' });
  const draw1 = drawbridge(-84), draw2 = drawbridge(-102);

  const movable: number[] = [];
  entities.forEach((e, i) => { if (e.body !== 'fixed') movable.push(i); });

  return {
    entities,
    movable,
    spawn: [0, MONSTER_Y, 3],
    checkpoints: [
      { z: -20, pos: [0, MONSTER_Y, -21.5] },
      { z: -39, pos: [0, MONSTER_Y, -40.5] },
      { z: -66, pos: [0, MONSTER_Y, -67.5] },
      { z: -85.5, pos: [0, MONSTER_Y, -87] },
    ],
    levers: [lever1, lever2, lever3],
    plates: [{ pos: [-3, 0, -26], half: 1.3, bridge, zIn: -27.4, zOut: -32.5 }],
    targets: [
      { pos: [-3.8, 3.2, -85.5], r: 1.6, bridge: draw1, hinge: [0, -0.2, -84], halfLen: 4, strandedZ: -77 },
      { pos: [3.8, 4.2, -103.5], r: 1.6, bridge: draw2, hinge: [0, -0.2, -102], halfLen: 4, strandedZ: -95 },
    ],
    hammers,
    movers: [],
    boulders: [{ ids: boulderIds, z: -59, y: 1.2, speed: 8, interval: 2.8, from: -39, to: -60 }],
    signs: [
      { text: 'BRING A BOX!', pos: [0, 4.6, -1], color: '#2bb3c0' },
      { text: 'THROW A BALL', pos: [3.6, 2.4, -72.5], color: '#7c5cff' },
      { text: 'ONE MORE!', pos: [-3.6, 2.4, -90.5], color: '#7c5cff' },
    ],
    stars: [
      [0, 1.5, -6], [-3.2, 4.3, -14], [3, 1.5, -22], [0, 2.6, -36.5],
      [4, 1.5, -46.5], [-4, 4.3, -56.5], [0, 1.5, -80], [0, 1.5, -98],
    ],
    finishZ: -112,
    killY: -10,
    timeBonus: 3600,
  };
}
