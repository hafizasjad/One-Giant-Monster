import { buildLevel as wobbleWay, type LevelDef } from './level1.ts';
import { buildLevel2 as doubleTrouble } from './level2.ts';

export interface LevelInfo {
  /** Stable id: best scores are saved under it. */
  id: string;
  name: string;
  build: () => LevelDef;
}

/** Every playable level, in menu order. Adding a level = adding a line here. */
export const LEVELS: LevelInfo[] = [
  { id: 'wobble-way', name: 'Wobble Way', build: wobbleWay },
  { id: 'double-trouble', name: 'Double Trouble', build: doubleTrouble },
];
