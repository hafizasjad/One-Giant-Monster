import { emptyArms, emptyHead, emptyLegs, emptySpecial, type ArmsInput, type HeadInput, type LegsInput, type SpecialInput } from '../../shared/protocol.ts';
import type { Scheme } from './Keyboard.ts';
import { mergeArms, mergeHead, mergeLegs, mergeSpecial, pick } from './merge.ts';

/** The part of the browser Gamepad object we read (standard mapping). */
export interface PadLike {
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}
export type PadSource = () => (PadLike | null)[];

const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, RT = 7, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

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
  reach: dir(p, LB, RB),
  grab: btn(p, A),
  throw: btn(p, X) || (p.buttons[RT]?.value ?? 0) > 0.5,
});

/** Right stick: sideways swings the gaze, up looks further away. */
export const padHead = (p: PadLike): HeadInput => ({ lx: deadzone(p.axes[2] ?? 0), ly: -deadzone(p.axes[3] ?? 0) + 0 });

export const padSpecial = (p: PadLike): SpecialInput => ({ roar: btn(p, B), stomp: btn(p, Y) });

const browserPads: PadSource = () =>
  typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];

export class Gamepads {
  constructor(private source: PadSource = browserPads) {}

  private list() {
    return this.source().filter((p): p is PadLike => !!p && p.connected);
  }

  /**
   * 'solo': any pad drives your roles.
   * 'shared': the first pad is legs + special, the second is arms + head
   * (with only one pad, its right stick is the head).
   */
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

  head(scheme: Scheme): HeadInput {
    const p = this.list();
    if (scheme === 'solo') return mergeHead(...p.map(padHead));
    const pad = p[1] ?? p[0];
    return pad ? padHead(pad) : emptyHead();
  }

  special(scheme: Scheme): SpecialInput {
    const p = this.list();
    if (scheme === 'solo') return mergeSpecial(...p.map(padSpecial));
    return p[0] ? padSpecial(p[0]) : emptySpecial();
  }
}
