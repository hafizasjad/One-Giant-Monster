// Types shared by the simulation, the renderer and the network layer.

export type Role = 'legs' | 'arms';

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

// Adding a new body part = adding a role here.
export interface Inputs {
  legs: LegsInput;
  arms: ArmsInput;
}

export const emptyLegs = (): LegsInput => ({ mx: 0, mz: 0, jump: false });
export const emptyArms = (): ArmsInput => ({ ax: 0, ay: 0, reach: 0, grab: false, throw: false });
export const emptyInputs = (): Inputs => ({ legs: emptyLegs(), arms: emptyArms() });

export interface GameEvent {
  k: string; // jump, land, grab, drop, throw, lever, bonk, star, fumble, plate, target, finish, chaos, hic, checkpoint
  p?: [number, number, number];
  txt?: string;
}

export interface Snapshot {
  t: number;
  /** monster: x, y, z (capsule centre), yaw, horizontal speed, grounded 0/1, vertical velocity */
  m: number[];
  /** hand: x, y, z, held entity (-1 none), throw charge 0..1 */
  h: number[];
  /** movable entity transforms, 7 numbers each (pos + quaternion) */
  b: number[];
  /** one 0/1 per lever (on), then per pressure plate (down), then per target (hit), in level order */
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

// Messages between the two players (relayed verbatim by the server).
export type PeerMsg =
  | { k: 'lobby'; hostRole: Role }
  /** level: index into LEVELS, or -1 for the hub; open: how many level doors the host has unlocked. */
  | { k: 'start'; hostRole: Role; level: number; open: number }
  | { k: 'restart' }
  | { k: 'snap'; s: Snapshot }
  | { k: 'input'; role: Role; i: LegsInput | ArmsInput };

export const otherRole = (r: Role): Role => (r === 'legs' ? 'arms' : 'legs');
