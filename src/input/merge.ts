import type { ArmsInput, LegsInput } from '../../shared/protocol.ts';

/** The value furthest from zero wins, so whichever device is being pushed takes over. */
export const pick = (...v: number[]) => v.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);

export const mergeLegs = (...s: LegsInput[]): LegsInput => ({
  mx: pick(...s.map((i) => i.mx)),
  mz: pick(...s.map((i) => i.mz)),
  jump: s.some((i) => i.jump),
});

export const mergeArms = (...s: ArmsInput[]): ArmsInput => ({
  ax: pick(...s.map((i) => i.ax)),
  ay: pick(...s.map((i) => i.ay)),
  reach: pick(...s.map((i) => i.reach)),
  grab: s.some((i) => i.grab),
  throw: s.some((i) => i.throw),
});
