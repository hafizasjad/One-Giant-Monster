import type { ArmsInput, LegsInput } from '../../shared/protocol.ts';
import { Gamepads } from './Gamepad.ts';
import { GAME_KEYS, Keyboard, type Scheme } from './Keyboard.ts';
import { mergeArms, mergeLegs } from './merge.ts';
import { Touch } from './Touch.ts';

export type Device = 'keyboard' | 'gamepad' | 'touch';

/** Every way of controlling the game, merged. Players can switch device at any time. */
export class Input {
  /** The device used most recently (drives which help text is shown). */
  device: Device = 'keyboard';
  onDevice?: () => void;
  readonly touch: Touch;
  private kb = new Keyboard();
  private pads = new Gamepads();

  constructor(touchRoot: HTMLElement) {
    this.touch = new Touch(touchRoot, () => this.use('touch'));
    if (this.touch.enabled) this.device = 'touch';
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || !GAME_KEYS.has(e.code)) return;
      this.touch.setEnabled(false);
      if (!this.touch.enabled) this.use('keyboard');
    });
    window.addEventListener('touchstart', () => {
      this.touch.setEnabled(true);
      this.use('touch');
    }, { passive: true });
  }

  private use(d: Device) {
    if (d === this.device) return;
    this.device = d;
    this.onDevice?.();
  }

  legs(scheme: Scheme): LegsInput {
    const pad = this.pads.legs(scheme);
    if (pad.mx || pad.mz || pad.jump) this.use('gamepad');
    return mergeLegs(this.kb.legs(scheme), pad, this.touch.legs());
  }

  arms(scheme: Scheme): ArmsInput {
    const pad = this.pads.arms(scheme);
    if (pad.ax || pad.ay || pad.reach || pad.grab || pad.throw) this.use('gamepad');
    return mergeArms(this.kb.arms(scheme), pad, this.touch.arms());
  }
}
