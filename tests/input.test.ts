import { describe, expect, it } from 'vitest';
import { deadzone, Gamepads, padArms, padHead, padLegs, padSpecial, type PadLike } from '../src/input/Gamepad.ts';
import { mergeArms, mergeLegs } from '../src/input/merge.ts';
import { emptyArms, emptyLegs, reassign, splitRoles } from '../shared/protocol.ts';

function pad(axes: number[] = [0, 0, 0, 0], pressed: number[] = [], rt = 0): PadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  buttons[7] = { pressed: rt > 0.5, value: rt };
  return { connected: true, axes, buttons };
}

describe('gamepad mapping', () => {
  it('ignores stick drift and rescales the rest to 0..1', () => {
    expect(deadzone(0.15)).toBe(0);
    expect(deadzone(-0.2)).toBe(0);
    expect(deadzone(1)).toBe(1);
    expect(deadzone(-1)).toBe(-1);
    expect(deadzone(0.6)).toBeCloseTo(0.5);
  });

  it('maps the left stick and A to the legs', () => {
    expect(padLegs(pad([1, -1, 0, 0], [0]))).toEqual({ mx: 1, mz: -1, jump: true });
    expect(padLegs(pad([0.1, 0.1, 0, 0]))).toEqual(emptyLegs());
  });

  it('lets the d-pad move too', () => {
    expect(padLegs(pad([0, 0, 0, 0], [12, 15]))).toEqual({ mx: 1, mz: -1, jump: false });
  });

  it('maps stick, bumpers, A and X / RT to the arms', () => {
    // Stick up moves the hand up; RB reaches out.
    expect(padArms(pad([-1, -1, 0, 0], [0, 5]))).toEqual({ ax: -1, ay: 1, reach: 1, grab: true, throw: false });
    expect(padArms(pad([0, 0, 0, 0], [4, 2]))).toEqual({ ax: 0, ay: 0, reach: -1, grab: false, throw: true });
    expect(padArms(pad([0, 0, 0, 0], [], 0.9)).throw).toBe(true);
    expect(padArms(pad())).toEqual(emptyArms());
  });

  it('maps the right stick to the head and B / Y to the special', () => {
    // Right stick right swings the gaze right; up looks further away.
    expect(padHead(pad([0, 0, 1, -1]))).toEqual({ lx: 1, ly: 1 });
    expect(padArms(pad([0, 0, 0, -1])).reach).toBe(0); // the right stick is the head's alone
    expect(padSpecial(pad([0, 0, 0, 0], [1]))).toEqual({ roar: true, stomp: false });
    expect(padSpecial(pad([0, 0, 0, 0], [3]))).toEqual({ roar: false, stomp: true });
  });
});

describe('gamepad assignment', () => {
  const right = pad([1, 0, 0, 0]);
  const up = pad([0, -1, 0, 0]);

  it('online: any pad drives your role', () => {
    const g = new Gamepads(() => [null, right, up]);
    expect(g.legs('solo')).toEqual({ mx: 1, mz: -1, jump: false });
    expect(g.arms('solo')).toMatchObject({ ax: 1, ay: 1 });
  });

  it('one device: first pad is the legs, second is the arms', () => {
    const g = new Gamepads(() => [right, up]);
    expect(g.legs('shared')).toEqual({ mx: 1, mz: 0, jump: false });
    expect(g.arms('shared')).toMatchObject({ ax: 0, ay: 1 });
  });

  it('one device with a single pad: it is the legs, arms stay idle', () => {
    const g = new Gamepads(() => [right]);
    expect(g.legs('shared').mx).toBe(1);
    expect(g.arms('shared')).toEqual(emptyArms());
  });

  it('one device: pad 1 also has the special, pad 2 the head (pad 1 if it is alone)', () => {
    const one = pad([0, 0, 1, 0], [1]);
    const two = pad([0, 0, -1, 0], [3]);
    expect(new Gamepads(() => [one, two]).special('shared')).toEqual({ roar: true, stomp: false });
    expect(new Gamepads(() => [one, two]).head('shared').lx).toBe(-1);
    expect(new Gamepads(() => [one]).head('shared').lx).toBe(1);
  });

  it('skips disconnected pads and copes with none', () => {
    expect(new Gamepads(() => [{ ...right, connected: false }, up]).legs('shared').mz).toBe(-1);
    expect(new Gamepads(() => []).legs('solo')).toEqual(emptyLegs());
  });
});

describe('merging devices', () => {
  it('takes the strongest axis and any pressed button', () => {
    expect(mergeLegs({ mx: 1, mz: 0, jump: false }, { mx: -0.4, mz: 0.5, jump: true })).toEqual({ mx: 1, mz: 0.5, jump: true });
    expect(mergeArms(emptyArms(), { ax: 0, ay: -0.3, reach: 1, grab: true, throw: false }))
      .toEqual({ ax: 0, ay: -0.3, reach: 1, grab: true, throw: false });
  });
});

describe('sharing roles', () => {
  it('splits four roles between one to four players', () => {
    expect(splitRoles([0])).toEqual({ legs: 0, arms: 0, head: 0, special: 0 });
    expect(splitRoles([0, 2])).toEqual({ legs: 0, special: 0, arms: 2, head: 2 });
    expect(splitRoles([0, 1, 3])).toEqual({ legs: 0, arms: 1, head: 3, special: 3 });
    expect(splitRoles([0, 1, 2, 3])).toEqual({ legs: 0, arms: 1, head: 2, special: 3 });
  });

  it('hands a missing player\'s roles to whoever has the fewest', () => {
    const roles = splitRoles([0, 1, 2]); // 2 has head + special
    expect(reassign(roles, [0, 1])).toEqual({ legs: 0, arms: 1, head: 0, special: 1 });
    expect(reassign(roles, [0, 1, 2])).toEqual(roles);
    expect(reassign(splitRoles([0, 1]), [0])).toEqual(splitRoles([0]));
  });
});
