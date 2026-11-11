import type { ArmsInput, HeadInput, LegsInput, SpecialInput } from '../../shared/protocol.ts';

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

export const mergeHead = (...s: HeadInput[]): HeadInput => ({
  lx: pick(...s.map((i) => i.lx)),
  ly: pick(...s.map((i) => i.ly)),
});

export const mergeSpecial = (...s: SpecialInput[]): SpecialInput => ({
  roar: s.some((i) => i.roar),
  stomp: s.some((i) => i.stomp),
});
