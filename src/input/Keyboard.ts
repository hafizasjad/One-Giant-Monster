import type { ArmsInput, LegsInput } from '../../shared/protocol.ts';

/** 'shared' = two players on one keyboard, 'solo' = one player per keyboard (online). */
export type Scheme = 'shared' | 'solo';

export const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'Comma', 'Period', 'ShiftRight',
]);

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

  legs(scheme: Scheme): LegsInput {
    const solo = scheme === 'solo';
    return {
      mx: this.axis(solo ? ['KeyA', 'ArrowLeft'] : ['KeyA'], solo ? ['KeyD', 'ArrowRight'] : ['KeyD']),
      mz: this.axis(solo ? ['KeyW', 'ArrowUp'] : ['KeyW'], solo ? ['KeyS', 'ArrowDown'] : ['KeyS']),
      jump: this.down.has('Space'),
    };
  }

  arms(scheme: Scheme): ArmsInput {
    if (scheme === 'solo') {
      return {
        ax: this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
        ay: this.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
        reach: this.axis(['KeyQ'], ['KeyE']),
        grab: this.down.has('Space'),
        throw: this.down.has('KeyF'),
      };
    }
    return {
      ax: this.axis(['ArrowLeft'], ['ArrowRight']),
      ay: this.axis(['ArrowDown'], ['ArrowUp']),
      reach: this.axis(['Comma'], ['Period']),
      grab: this.down.has('ShiftRight'),
      throw: this.down.has('Enter'),
    };
  }
}
