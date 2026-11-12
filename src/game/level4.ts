// Level 4, "Lift Off": the floor moves. A ferry over a gap, three platforms sliding
// sideways, a lift the arms have to call, and a throw from the top. Runs along -Z.
import { MONSTER_Y, type EntityDef, type LevelDef, type V3 } from './level1.ts';

const MOVER = 0xffa53d;
const TOP = 5; // height of the upper deck

export function buildLevel4(): LevelDef {
  const entities: EntityDef[] = [];
  const add = (e: EntityDef) => entities.push(e) - 1;
  /** A floor slab from zFrom to zTo whose top is at height `top`. */
  const ground = (zFrom: number, zTo: number, color: number, top = 0) => {
    const halfY = top > 0 ? (top + 1) / 2 : 0.5;
    return add({ shape: 'box', half: [5, halfY, (zFrom - zTo) / 2], pos: [0, top - halfY, (zFrom + zTo) / 2], body: 'fixed', color, tag: 'ground' });
  };
  const movers: LevelDef['movers'] = [];
  /** A platform that glides between a and b (its top surface is 0.2 above those points). */
  const mover = (half: V3, a: V3, b: V3, period: number, extra: Partial<LevelDef['movers'][number]> = {}) => {
    const id = add({ shape: 'box', half, pos: a, body: 'kinematic', color: MOVER, tag: 'mover' });
    movers.push({ id, a, b, period, ...extra });
    return id;
  };

  // --- 1. A ferry across the first gap ---------------------------------------
  ground(8, -10, 0xb7e3a0);
  mover([2, 0.2, 2.5], [0, -0.2, -12.5], [0, -0.2, -19.5], 6);

  // --- 2. Three platforms sliding sideways, out of step with each other ---------
  ground(-22, -34, 0xffe08a);
  [-36.5, -41.5, -46.5].forEach((z, i) =>
    mover([2.2, 0.2, 2.5], [-2.2, -0.2, z], [2.2, -0.2, z], 7, { phase: i % 2 ? Math.PI : 0 }));

  // --- 3. A lift up to the top deck, called with a lever on the cliff face --------
  ground(-49, -62, 0xa8d8ff);
  mover([2, 0.2, 2], [0, -0.2, -64], [0, TOP - 0.2, -64], 2.2, { lever: 0, returns: true });
  ground(-66, -80, 0xd6b3ff, TOP);

  // --- 4. Throw from the top deck to drop the drawbridge --------------------------
  for (let i = 0; i < 4; i++) {
    add({
      shape: 'ball', half: [0.45, 0.45, 0.45], pos: [-3 + i * 2, TOP + 0.5, -74], body: 'dynamic',
      color: 0xff4fa3, tag: 'ball', density: 0.6, restitution: 0.6, friction: 0.5,
    });
  }
  ground(-88, -100, 0x9fd8ff, TOP);
  const drawbridge = add({ shape: 'box', half: [2, 0.2, 4], pos: [0, TOP + 3.8, -88], body: 'kinematic', color: 0xc98b4b, tag: 'drawbridge' });

  const movable: number[] = [];
  entities.forEach((e, i) => { if (e.body !== 'fixed') movable.push(i); });

  return {
    entities,
    movable,
    spawn: [0, MONSTER_Y, 3],
    checkpoints: [
      { z: -23, pos: [0, MONSTER_Y, -25] },
      { z: -50, pos: [0, MONSTER_Y, -52] },
      { z: -67.5, pos: [0, TOP + MONSTER_Y, -69] },
    ],
    // The lever is on the cliff next to the lift: pull it while standing on the lift.
    levers: [{ pos: [2.6, 3.2, -65.7], door: -1, closedY: 0, openY: 0 }],
    plates: [],
    targets: [{ pos: [3.8, TOP + 3.2, -89.5], r: 1.6, bridge: drawbridge, hinge: [0, TOP - 0.2, -88], halfLen: 4, strandedZ: -81 }],
    hammers: [],
    boulders: [],
    movers,
    signs: [
      { text: 'HOP ON!', pos: [0, 3.4, -9], color: '#e07b00' },
      { text: 'MIND THE GAPS', pos: [0, 3.4, -33], color: '#e07b00' },
      { text: 'GOING UP?', pos: [-2.6, 3.2, -65.6], color: '#7c5cff' },
      { text: 'THROW A BALL', pos: [-3.6, TOP + 2.4, -77], color: '#7c5cff' },
    ],
    stars: [
      [0, 1.5, -16], [-3.5, 1.5, -28], [3.4, 1.5, -36.5], [0, 1.5, -41.5],
      [-3.5, 1.5, -56], [0, 3, -64], [0, TOP + 1.5, -72], [0, TOP + 1.5, -84],
    ],
    finishZ: -96,
    finishY: TOP,
    killY: -10,
    timeBonus: 3600,
  };
}
