// Level 3, "Frozen Flop": almost everything is ice. The legs slide, crates slide,
// and stopping where you meant to is the whole challenge. The course runs along -Z.
import { MONSTER_Y, type EntityDef, type LevelDef } from './level1.ts';

const CRATE = { density: 0.35, restitution: 0.35, friction: 0.6 } as const;
const ICE = 0xa8dcff, SNOW = 0xf4f8ff, WALL = 0x7fa8d8;

export function buildLevel3(): LevelDef {
  const entities: EntityDef[] = [];
  const add = (e: EntityDef) => entities.push(e) - 1;
  /** A floor slab from zFrom to zTo, centred on x with the given half width. */
  const floor = (tag: 'ground' | 'ice', zFrom: number, zTo: number, x = 0, halfW = 5) =>
    add({
      shape: 'box', half: [halfW, 0.5, (zFrom - zTo) / 2], pos: [x, -0.5, (zFrom + zTo) / 2], body: 'fixed',
      color: tag === 'ice' ? ICE : SNOW, tag, friction: tag === 'ice' ? 0.02 : 0.8,
    });

  // --- 1. Snowy start, then an ice rink with a crate wall and a lever door at the far end
  floor('ground', 8, -4);
  floor('ice', -4, -30);
  const crateColors = [0x58c4ff, 0x9bd8ff, 0x7c9cff, 0xb6a8ff];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      add({
        shape: 'box', half: [0.6, 0.6, 0.6], pos: [-4.2 + i * 1.2, 0.6 + row * 1.2, -12],
        body: 'dynamic', color: crateColors[(i + row) % 4], tag: 'crate', ...CRATE,
      });
    }
  }
  add({ shape: 'box', half: [1.7, 2.2, 0.4], pos: [-3.3, 2.2, -28], body: 'fixed', color: WALL, tag: 'wall' });
  add({ shape: 'box', half: [1.7, 2.2, 0.4], pos: [3.3, 2.2, -28], body: 'fixed', color: WALL, tag: 'wall' });
  const door = add({ shape: 'box', half: [1.6, 2.2, 0.3], pos: [0, 2.2, -28], body: 'kinematic', color: 0xff5d73, tag: 'door' });

  // --- 2. A rest pad, then a narrow zigzag of ice -------------------------------
  floor('ground', -30, -36);
  floor('ice', -36, -46, -0.9, 2.2);
  floor('ice', -46, -56, 0.9, 2.2);
  floor('ice', -56, -64, 0, 2.2);

  // --- 3. Curling: get a crate into the pocket around the pressure plate ----------
  floor('ground', -64, -70);
  floor('ice', -70, -90);
  add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [2.4, 0.6, -73], body: 'dynamic', color: 0x4dd0e1, tag: 'crate', ...CRATE });
  add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [-2.4, 0.6, -73.5], body: 'dynamic', color: 0x4dd0e1, tag: 'crate', ...CRATE });
  const rail = (x: number, z: number, hx: number, hz: number) =>
    add({ shape: 'box', half: [hx, 0.25, hz], pos: [x, 0.25, z], body: 'fixed', color: 0xff8fb1, tag: 'wall' });
  rail(-1.8, -86, 0.15, 1.6);
  rail(1.8, -86, 0.15, 1.6);
  rail(0, -87.75, 1.95, 0.15);
  const bridge = add({ shape: 'box', half: [2, 0.2, 2.5], pos: [0, -0.25, -87.4], body: 'kinematic', color: 0xb388ff, tag: 'bridge' });

  // --- 4. A throw from the ice to drop the last drawbridge -------------------------
  floor('ground', -98, -102);
  floor('ice', -102, -112);
  for (let i = 0; i < 4; i++) {
    add({
      shape: 'ball', half: [0.45, 0.45, 0.45], pos: [-3 + i * 2, 0.5, -105], body: 'dynamic',
      color: 0xff4fa3, tag: 'ball', density: 0.6, restitution: 0.6, friction: 0.5,
    });
  }
  floor('ground', -120, -132);
  const drawbridge = add({ shape: 'box', half: [2, 0.2, 4], pos: [0, 3.8, -120], body: 'kinematic', color: 0xc98b4b, tag: 'drawbridge' });

  const movable: number[] = [];
  entities.forEach((e, i) => { if (e.body !== 'fixed') movable.push(i); });

  return {
    entities,
    movable,
    spawn: [0, MONSTER_Y, 3],
    checkpoints: [
      { z: -31, pos: [0, MONSTER_Y, -33] },
      { z: -65, pos: [0, MONSTER_Y, -67] },
      { z: -98.5, pos: [0, MONSTER_Y, -100] },
    ],
    levers: [{ pos: [3.2, 3.2, -27.3], door, closedY: 2.2, openY: -2.45 }],
    plates: [{ pos: [0, 0, -86], half: 1.3, bridge, zIn: -87.4, zOut: -92.5 }],
    targets: [{ pos: [3.8, 3.2, -121.5], r: 1.6, bridge: drawbridge, hinge: [0, -0.2, -120], halfLen: 4, strandedZ: -113 }],
    hammers: [],
    boulders: [],
    movers: [],
    signs: [
      { text: 'SLIPPERY!', pos: [0, 3.4, -5], color: '#2b8fd6' },
      { text: 'SLIDE IT IN', pos: [0, 3.9, -86], color: '#2bb3c0' },
      { text: 'THROW A BALL', pos: [-3.6, 2.4, -108], color: '#7c5cff' },
    ],
    stars: [
      [0, 1.5, -8], [-3.5, 1.5, -20], [3.5, 4.3, -22], [-2.3, 1.5, -41],
      [2.3, 1.5, -51], [0, 2.6, -60], [0, 1.5, -79], [0, 1.5, -116],
    ],
    finishZ: -128,
    killY: -10,
    timeBonus: 3600,
    theme: { sky: 0xd4ecff, sun: 0xeaf4ff, clouds: 0xffffff, scenery: 'pines' },
  };
}
