import type { ArmsInput, HeadInput, LegsInput, SpecialInput } from '../../shared/protocol.ts';

/**
 * 'shared' = every role has its own keys, so several roles (or people) fit on one keyboard.
 * 'solo'   = the comfortable layout for one person online.
 */
export type Scheme = 'shared' | 'solo';

export const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'Comma', 'Period', 'ShiftRight',
  'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyZ', 'KeyX', 'KeyR', 'KeyC',
]);

const WASD = { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'] };
const ARROWS = { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'] };
const IJKL = { l: ['KeyJ'], r: ['KeyL'], u: ['KeyI'], d: ['KeyK'] };
type Cluster = typeof WASD;
const both = (a: Cluster, b: Cluster): Cluster => ({ l: [...a.l, ...b.l], r: [...a.r, ...b.r], u: [...a.u, ...b.u], d: [...a.d, ...b.d] });

export class Keyboard {
  private down = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private axis(neg: string[], pos: string[]) {
    const has = (codes: string[]) => codes.some((c) => this.down.has(c));
    return (has(pos) ? 1 : 0) - (has(neg) ? 1 : 0);
  }

  /** `arrows`: in the solo layout the arrow keys also move, unless the head needs them. */
  legs(scheme: Scheme, arrows = true): LegsInput {
    const c = scheme === 'solo' && arrows ? both(WASD, ARROWS) : WASD;
    return { mx: this.axis(c.l, c.r), mz: this.axis(c.u, c.d), jump: this.down.has('Space') };
  }

  arms(scheme: Scheme, arrows = true): ArmsInput {
    if (scheme === 'solo') {
      const c = arrows ? both(WASD, ARROWS) : WASD;
      return {
        ax: this.axis(c.l, c.r),
        ay: this.axis(c.d, c.u),
        reach: this.axis(['KeyQ'], ['KeyE']),
        grab: this.down.has('Space'),
        throw: this.down.has('KeyF'),
      };
    }
    return {
      ax: this.axis(ARROWS.l, ARROWS.r),
      ay: this.axis(ARROWS.d, ARROWS.u),
      reach: this.axis(['Comma'], ['Period']),
      grab: this.down.has('ShiftRight'),
      throw: this.down.has('Enter'),
    };
  }

  /** `wasd`: in the solo layout WASD also looks, when this player has nothing to move. */
  head(scheme: Scheme, wasd = false): HeadInput {
    const c = scheme === 'shared' ? IJKL : wasd ? both(ARROWS, WASD) : ARROWS;
    return { lx: this.axis(c.l, c.r), ly: this.axis(c.d, c.u) };
  }

  special(scheme: Scheme): SpecialInput {
    return scheme === 'shared'
      ? { roar: this.down.has('KeyZ'), stomp: this.down.has('KeyX') }
      : { roar: this.down.has('KeyR'), stomp: this.down.has('KeyC') };
  }
}
