import type { ArmsInput, HeadInput, LegsInput, Role, RoleInput, SpecialInput } from '../../shared/protocol.ts';
import { Gamepads } from './Gamepad.ts';
import { GAME_KEYS, Keyboard, type Scheme } from './Keyboard.ts';
import { mergeArms, mergeHead, mergeLegs, mergeSpecial } from './merge.ts';
import { Touch } from './Touch.ts';

export type Device = 'keyboard' | 'gamepad' | 'touch';

/**
 * Every way of controlling the game, merged. Players can switch device at any time.
 * Call setRoles() with the roles played on this machine; the layouts adapt so that
 * one person holding several roles gets keys and buttons that don't clash.
 */
export class Input {
  /** The device used most recently (drives which help text is shown). */
  device: Device = 'keyboard';
  onDevice?: () => void;
  scheme: Scheme = 'solo';
  /** This player holds no role that moves something with WASD. */
  onlyLooks = false;
  readonly touch: Touch;
  private kb = new Keyboard();
  private pads = new Gamepads();
  private arrowsFree = true;

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

  /** `local`: everyone shares this one device, so every role needs its own keys. */
  setRoles(mine: Role[], local: boolean) {
    const has = (r: Role) => mine.includes(r);
    const crowded = has('legs') && has('arms');
    this.scheme = local || crowded ? 'shared' : 'solo';
    this.arrowsFree = !has('head');
    this.onlyLooks = !has('legs') && !has('arms');
    // Legs and arms each need a stick of their own, so they get separate panels.
    const panels = crowded
      ? [mine.filter((r) => r === 'legs' || r === 'special'), mine.filter((r) => r === 'arms' || r === 'head')]
      : [mine];
    this.touch.show(mine.length ? panels : null);
  }

  private use(d: Device) {
    if (d === this.device) return;
    this.device = d;
    this.onDevice?.();
  }

  legs(): LegsInput {
    const pad = this.pads.legs(this.scheme);
    if (pad.mx || pad.mz || pad.jump) this.use('gamepad');
    return mergeLegs(this.kb.legs(this.scheme, this.arrowsFree), pad, this.touch.legs());
  }

  arms(): ArmsInput {
    const pad = this.pads.arms(this.scheme);
    if (pad.ax || pad.ay || pad.reach || pad.grab || pad.throw) this.use('gamepad');
    return mergeArms(this.kb.arms(this.scheme, this.arrowsFree), pad, this.touch.arms());
  }

  head(): HeadInput {
    const pad = this.pads.head(this.scheme);
    if (pad.lx || pad.ly) this.use('gamepad');
    return mergeHead(this.kb.head(this.scheme, this.onlyLooks), pad, this.touch.head());
  }

  special(): SpecialInput {
    const pad = this.pads.special(this.scheme);
    if (pad.roar || pad.stomp) this.use('gamepad');
    return mergeSpecial(this.kb.special(this.scheme), pad, this.touch.special());
  }

  read(role: Role): RoleInput {
    return role === 'legs' ? this.legs() : role === 'arms' ? this.arms() : role === 'head' ? this.head() : this.special();
  }
}
