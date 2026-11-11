import { emptyArms, emptyLegs, type ArmsInput, type LegsInput } from '../../shared/protocol.ts';
import type { Scheme } from './Keyboard.ts';
import { mergeArms, mergeLegs, pick } from './merge.ts';

/** The part of the browser Gamepad object we read (standard mapping). */
export interface PadLike {
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}
export type PadSource = () => (PadLike | null)[];

const A = 0, X = 2, LB = 4, RB = 5, RT = 7, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

export function deadzone(v: number, dead = 0.2) {
  const a = Math.abs(v);
  return a <= dead ? 0 : Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
}

const btn = (p: PadLike, i: number) => !!p.buttons[i]?.pressed;
const dir = (p: PadLike, neg: number, pos: number) => (btn(p, pos) ? 1 : 0) - (btn(p, neg) ? 1 : 0);
/** Left stick or d-pad. y is positive downwards, like the stick itself. */
const moveX = (p: PadLike) => pick(deadzone(p.axes[0] ?? 0), dir(p, LEFT, RIGHT));
const moveY = (p: PadLike) => pick(deadzone(p.axes[1] ?? 0), dir(p, UP, DOWN));

export const padLegs = (p: PadLike): LegsInput => ({ mx: moveX(p), mz: moveY(p), jump: btn(p, A) });

export const padArms = (p: PadLike): ArmsInput => ({
  ax: moveX(p),
  ay: -moveY(p) + 0,
  reach: pick(dir(p, LB, RB), -deadzone(p.axes[3] ?? 0) + 0),
  grab: btn(p, A),
  throw: btn(p, X) || (p.buttons[RT]?.value ?? 0) > 0.5,
});

const browserPads: PadSource = () =>
  typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];

export class Gamepads {
  constructor(private source: PadSource = browserPads) {}

  private list() {
    return this.source().filter((p): p is PadLike => !!p && p.connected);
  }

  /** 'solo': any pad drives your role. 'shared': first pad is the legs, second is the arms. */
  legs(scheme: Scheme): LegsInput {
    const p = this.list();
    if (scheme === 'solo') return mergeLegs(...p.map(padLegs));
    return p[0] ? padLegs(p[0]) : emptyLegs();
  }

  arms(scheme: Scheme): ArmsInput {
    const p = this.list();
    if (scheme === 'solo') return mergeArms(...p.map(padArms));
    return p[1] ? padArms(p[1]) : emptyArms();
  }
}
