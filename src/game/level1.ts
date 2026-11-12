// Course description. Pure data: the simulation builds physics bodies from it
// and the renderer builds meshes from it. The course runs along -Z.

export type V3 = [number, number, number];
export type BodyKind = 'fixed' | 'dynamic' | 'kinematic';

export interface EntityDef {
  shape: 'box' | 'ball';
  half: V3; // half extents (ball: radius in [0])
  pos: V3;
  body: BodyKind;
  color: number;
  tag: string; // ground, ice, wall, crate, ball, boulder, door, bridge, drawbridge, hammer
  density?: number;
  restitution?: number;
  friction?: number;
}

export interface HammerDef {
  head: number;
  pivot: V3;
  len: number;
  amp: number;
  speed: number;
  phase: number;
}

export interface LevelDef {
  entities: EntityDef[];
  movable: number[]; // entity indices that are not fixed, in snapshot order
  spawn: V3;
  checkpoints: { z: number; pos: V3 }[];
  /** Pull one to sink its door into the floor. */
  levers: { pos: V3; door: number; closedY: number; openY: number }[];
  /** While something sits on one, its bridge slides out. */
  plates: { pos: V3; half: number; bridge: number; zIn: number; zOut: number }[];
  /** Hit one with a thrown object to drop its drawbridge. Balls that end up beyond strandedZ before that come back. */
  targets: { pos: V3; r: number; bridge: number; hinge: V3; halfLen: number; strandedZ: number }[];
  hammers: HammerDef[];
  /** Boulders roll from z towards the start while the monster is between `from` and `to`. */
  boulders: { ids: number[]; z: number; y: number; speed: number; interval: number; from: number; to: number }[];
  /** Free-standing floating signs. */
  signs: { text: string; pos: V3; color?: string }[];
  /** Score for finishing instantly; 10 points are lost per second. */
  timeBonus: number;
  stars: V3[];
  finishZ: number;
  killY: number;
}

export const MONSTER_Y = 1.6; // capsule centre height when standing on y=0

export function buildLevel(): LevelDef {
  const entities: EntityDef[] = [];
  const add = (e: EntityDef) => entities.push(e) - 1;

  // --- Ground ---------------------------------------------------------
  add({ shape: 'box', half: [5, 0.5, 21], pos: [0, -0.5, -13], body: 'fixed', color: 0x8ee07a, tag: 'ground' });
  add({ shape: 'box', half: [5, 0.5, 18], pos: [0, -0.5, -60], body: 'fixed', color: 0xffd76b, tag: 'ground' });
  add({ shape: 'box', half: [5, 0.5, 8], pos: [0, -0.5, -94], body: 'fixed', color: 0x9fd8ff, tag: 'ground' });

  // --- 1. Crate wall ---------------------------------------------------
  const crateColors = [0xff8a5c, 0xffb347, 0xff6f91, 0xf9c74f];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      add({
        shape: 'box', half: [0.6, 0.6, 0.6], pos: [-4.2 + i * 1.2, 0.6 + row * 1.2, -8],
        body: 'dynamic', color: crateColors[(i + row) % 4], tag: 'crate',
        density: 0.35, restitution: 0.35, friction: 0.6,
      });
    }
  }

  // --- 2. Lever door ---------------------------------------------------
  add({ shape: 'box', half: [1.7, 2.2, 0.4], pos: [-3.3, 2.2, -20], body: 'fixed', color: 0x8d7bd8, tag: 'wall' });
  add({ shape: 'box', half: [1.7, 2.2, 0.4], pos: [3.3, 2.2, -20], body: 'fixed', color: 0x8d7bd8, tag: 'wall' });
  const door = add({ shape: 'box', half: [1.6, 2.2, 0.3], pos: [0, 2.2, -20], body: 'kinematic', color: 0xff5d73, tag: 'door' });

  // --- 3. Pressure plate + sliding bridge -------------------------------
  add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [2.5, 0.6, -27], body: 'dynamic', color: 0x4dd0e1, tag: 'crate', density: 0.35, restitution: 0.35, friction: 0.6 });
  add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [3.9, 0.6, -27.6], body: 'dynamic', color: 0x4dd0e1, tag: 'crate', density: 0.35, restitution: 0.35, friction: 0.6 });
  const bridge = add({ shape: 'box', half: [2, 0.2, 2.5], pos: [0, -0.25, -31.4], body: 'kinematic', color: 0xb388ff, tag: 'bridge' });

  // --- 4. Hammer alley ---------------------------------------------------
  const hammers: HammerDef[] = [];
  const hz = [-50, -55, -60];
  const hs = [1.6, 2.0, 1.8];
  for (let i = 0; i < 3; i++) {
    const head = add({ shape: 'box', half: [0.9, 0.9, 0.7], pos: [0, 2, hz[i]], body: 'kinematic', color: 0xe63946, tag: 'hammer' });
    hammers.push({ head, pivot: [0, 7.2, hz[i]], len: 5.2, amp: 1.15, speed: hs[i], phase: i * 2.1 });
  }
  const boulderIds: number[] = [];
  for (let i = 0; i < 3; i++) {
    boulderIds.push(add({
      shape: 'ball', half: [0.8, 0.8, 0.8], pos: [i * 3, -60, -65], body: 'dynamic',
      color: 0x7d6b5d, tag: 'boulder', density: 1.2, restitution: 0.3, friction: 0.8,
    }));
  }

  // --- 5. Target toss + drawbridge ---------------------------------------
  for (let i = 0; i < 4; i++) {
    add({
      shape: 'ball', half: [0.45, 0.45, 0.45], pos: [-3 + i * 2, 0.5, -72], body: 'dynamic',
      color: 0xff4fa3, tag: 'ball', density: 0.6, restitution: 0.6, friction: 0.5,
    });
  }
  const hinge: V3 = [0, -0.2, -86];
  const drawbridge = add({ shape: 'box', half: [2, 0.2, 4], pos: [0, 3.8, -86], body: 'kinematic', color: 0xc98b4b, tag: 'drawbridge' });

  const movable: number[] = [];
  entities.forEach((e, i) => { if (e.body !== 'fixed') movable.push(i); });

  return {
    entities,
    movable,
    spawn: [0, MONSTER_Y, 3],
    checkpoints: [
      { z: -22, pos: [0, MONSTER_Y, -23.5] },
      { z: -43, pos: [0, MONSTER_Y, -44.5] },
      { z: -67, pos: [0, MONSTER_Y, -68.5] },
    ],
    levers: [{ pos: [3.2, 3.2, -19.3], door, closedY: 2.2, openY: -2.45 }], // doors sink into the floor so they never block the camera
    plates: [{ pos: [-3, 0, -30], half: 1.3, bridge, zIn: -31.4, zOut: -36.5 }],
    targets: [{ pos: [3.8, 3.2, -87.5], r: 1.6, bridge: drawbridge, hinge, halfLen: 4, strandedZ: -79 }],
    hammers,
    boulders: [{ ids: boulderIds, z: -65, y: 1.2, speed: 8, interval: 3.2, from: -41, to: -70 }],
    signs: [{ text: 'THROW A BALL', pos: [-3.6, 2.4, -74.5], color: '#7c5cff' }],
    timeBonus: 3000,
    stars: [
      [0, 1.5, -4], [-3, 4.3, -13], [3, 1.5, -16], [0, 1.5, -25],
      [0, 2.6, -40.5], [-4, 1.5, -52.5], [4, 4.3, -63.5], [0, 1.5, -82],
    ],
    finishZ: -96,
    killY: -10,
  };
}
