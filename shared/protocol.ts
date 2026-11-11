// Types shared by the simulation, the renderer and the network layer.

export type Role = 'legs' | 'arms' | 'head' | 'special';
export const ROLES: Role[] = ['legs', 'arms', 'head', 'special'];

export interface LegsInput {
  mx: number; // -1..1, world X (screen right is +)
  mz: number; // -1..1, world Z (forward / away from camera is -)
  jump: boolean;
}

export interface ArmsInput {
  ax: number; // -1..1, hand towards the monster's right
  ay: number; // -1..1, hand up
  reach: number; // -1..1, hand further out
  grab: boolean; // press: grab / drop / pull lever
  throw: boolean; // hold to charge, release to throw
}

export interface HeadInput {
  lx: number; // -1..1, swing the gaze right
  ly: number; // -1..1, look further away
}

export interface SpecialInput {
  roar: boolean; // press
  stomp: boolean; // press
}

// Adding a new body part = adding a role here.
export interface Inputs {
  legs: LegsInput;
  arms: ArmsInput;
  head: HeadInput;
  special: SpecialInput;
}
export type RoleInput = Inputs[Role];

export const emptyLegs = (): LegsInput => ({ mx: 0, mz: 0, jump: false });
export const emptyArms = (): ArmsInput => ({ ax: 0, ay: 0, reach: 0, grab: false, throw: false });
export const emptyHead = (): HeadInput => ({ lx: 0, ly: 0 });
export const emptySpecial = (): SpecialInput => ({ roar: false, stomp: false });
export const emptyInputs = (): Inputs => ({ legs: emptyLegs(), arms: emptyArms(), head: emptyHead(), special: emptySpecial() });

/** Which player (0 = host, 1..3 = guests) holds each role. Every role always has a player. */
export type RoleMap = Record<Role, number>;

/** The default way to share four roles between one to four players. */
export function splitRoles(players: number[]): RoleMap {
  const p = players.length ? players : [0];
  if (p.length === 1) return { legs: p[0], arms: p[0], head: p[0], special: p[0] };
  if (p.length === 2) return { legs: p[0], special: p[0], arms: p[1], head: p[1] };
  if (p.length === 3) return { legs: p[0], arms: p[1], head: p[2], special: p[2] };
  return { legs: p[0], arms: p[1], head: p[2], special: p[3] };
}

/** Hand the roles of players who are gone to whoever is left, fewest roles first. */
export function reassign(roles: RoleMap, present: number[]): RoleMap {
  const out = { ...roles };
  if (!present.length) return out;
  for (const r of ROLES) {
    if (present.includes(out[r])) continue;
    const load = (p: number) => ROLES.filter((q) => out[q] === p).length;
    out[r] = present.reduce((a, b) => (load(b) < load(a) ? b : a));
  }
  return out;
}

export interface GameEvent {
  k: string; // jump, land, grab, drop, throw, lever, bonk, star, fumble, plate, target, finish, chaos, hic, checkpoint, roar, stomp, smash, button
  p?: [number, number, number];
  txt?: string;
}

export interface Snapshot {
  t: number;
  /** monster: x, y, z (capsule centre), yaw, horizontal speed, grounded 0/1, vertical velocity */
  m: number[];
  /** hand: x, y, z, held entity (-1 none), throw charge 0..1 */
  h: number[];
  /** gaze: swing angle (0 = straight down the course, + = right), distance, height of the spot */
  g: number[];
  /** how solid each ghost is, 0..1: ghost platforms first, then ghost stars */
  gh: number[];
  /** special cooldowns left, 0 (ready) .. 1: roar, stomp */
  sp: number[];
  /** movable entity transforms, 7 numbers each (pos + quaternion) */
  b: number[];
  /** lever on, plate down, target hit, cracked wall broken, heavy button pressed */
  s: number[];
  /** collected stars bitmask */
  stars: number;
  /** time, fumbles, finished 0/1, final score, star count */
  sc: number[];
  /** active chaos event */
  ch: { name: string; warn: boolean; t: number } | null;
  cp: number;
  ev: GameEvent[];
}

// Messages between players (relayed by the server: host to guests, guests to host).
export type PeerMsg =
  | { k: 'lobby'; roles: RoleMap; players: number[] }
  | { k: 'start'; roles: RoleMap }
  | { k: 'restart' }
  | { k: 'snap'; s: Snapshot }
  | { k: 'input'; role: Role; i: RoleInput };
