// The hub: a small plaza with one door per level. Walk the monster into an open
// door to play that level. Nothing here can be won or lost; it is a waiting room
// with toys in it.
import { MONSTER_Y, type EntityDef, type LevelDef } from './level1.ts';

export interface HubDoor {
  name: string;
  /** Locked doors look shut and don't lead anywhere. */
  open: boolean;
  /** Second line on the door's sign, e.g. the best result. */
  note: string;
}

const SPACING = 6, DOOR_Z = -11;
const COLORS = [0xffc9a8, 0xb8e986, 0xa8dcff, 0xffa53d, 0xd6b3ff, 0xff8fb1];
const CRATE = { density: 0.35, restitution: 0.35, friction: 0.6 } as const;

export const hubDoorX = (i: number, count: number) => (i - (count - 1) / 2) * SPACING;

/** Which door (if any) is the monster standing in? */
export function hubDoorAt(x: number, z: number, count: number): number {
  if (z > DOOR_Z + 0.4 || z < DOOR_Z - 2) return -1;
  for (let i = 0; i < count; i++) if (Math.abs(x - hubDoorX(i, count)) < 1.3) return i;
  return -1;
}

export function buildHub(doors: HubDoor[], banner = 'PICK A DOOR'): LevelDef {
  const entities: EntityDef[] = [];
  const add = (e: EntityDef) => entities.push(e) - 1;
  const n = doors.length;
  const halfW = Math.max(8, (n * SPACING) / 2 + 1);
  const signs: LevelDef['signs'] = [{ text: banner, pos: [0, 10.2, DOOR_Z - 0.6], color: '#ff4f8b', scale: 1.8 }];

  add({ shape: 'box', half: [halfW, 0.5, 11.5], pos: [0, -0.5, -3.5], body: 'fixed', color: 0xfff1c9, tag: 'ground' });

  doors.forEach((d, i) => {
    const x = hubDoorX(i, n);
    const frame = d.open ? 0x7c5cff : 0x6b6880;
    for (const sx of [-1, 1]) {
      add({ shape: 'box', half: [0.3, 2.3, 0.6], pos: [x + sx * 2, 2.3, DOOR_Z - 0.6], body: 'fixed', color: frame, tag: 'wall' });
    }
    add({ shape: 'box', half: [2.3, 0.35, 0.6], pos: [x, 4.95, DOOR_Z - 0.6], body: 'fixed', color: frame, tag: 'wall' });
    // The back of the doorway: bright when open, dark when locked.
    add({ shape: 'box', half: [1.7, 2.3, 0.15], pos: [x, 2.3, DOOR_Z - 2.6], body: 'fixed', color: d.open ? COLORS[i % COLORS.length] : 0x3a3850, tag: 'wall' });
    signs.push({ text: `${i + 1} ${d.name.toUpperCase()}`, pos: [x, 7.5, DOOR_Z - 0.6], color: d.open ? '#7c5cff' : '#6b6880', scale: 1.3 });
    signs.push({ text: d.note, pos: [x, 6.1, DOOR_Z - 0.6], color: d.open ? '#e07b00' : '#6b6880', scale: 1.3 });
  });

  // Toys to fool around with while waiting.
  [[-3.2, -2], [-2.2, -3.2], [3.4, -1.5]].forEach(([x, z], i) =>
    add({ shape: 'box', half: [0.6, 0.6, 0.6], pos: [x, 0.6, z], body: 'dynamic', color: [0x4dd0e1, 0xffd23f, 0xff7ab6][i], tag: 'crate', ...CRATE }));
  [[2.2, -4], [-4.5, 1], [4.8, 2]].forEach(([x, z]) =>
    add({ shape: 'ball', half: [0.45, 0.45, 0.45], pos: [x, 0.5, z], body: 'dynamic', color: 0xff4fa3, tag: 'ball', density: 0.6, restitution: 0.6, friction: 0.5 }));

  const movable: number[] = [];
  entities.forEach((e, i) => { if (e.body !== 'fixed') movable.push(i); });

  return {
    entities,
    movable,
    spawn: [0, MONSTER_Y, 4],
    checkpoints: [],
    levers: [],
    plates: [],
    targets: [],
    hammers: [],
    boulders: [],
    movers: [],
    signs,
    stars: [],
    finishZ: -20,
    noFinish: true,
    killY: -10,
    timeBonus: 0,
    theme: { sky: 0x9fe6d8, clouds: 0xffffff, scenery: 'trees' },
  };
}
