import type { ArmsInput, LegsInput, Role } from '../../shared/protocol.ts';

const STICK_R = 56; // px of travel for full deflection

function el(tag: string, cls: string, parent: HTMLElement, text = '') {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.append(e);
  return e;
}

function capture(target: HTMLElement, id: number) {
  try { target.setPointerCapture(id); } catch { /* pointer already gone */ }
}

/** A joystick that appears wherever the thumb lands inside its zone. */
class Stick {
  x = 0;
  y = 0; // positive = down the screen
  private id = -1;
  private ox = 0;
  private oy = 0;
  private base: HTMLElement;
  private knob: HTMLElement;

  constructor(pad: HTMLElement, onUse: () => void) {
    const zone = el('div', 'zone', pad);
    this.base = el('div', 'stick', zone);
    this.knob = el('i', '', this.base);
    zone.addEventListener('pointerdown', (e) => {
      if (this.id !== -1) return;
      e.preventDefault();
      onUse();
      this.id = e.pointerId;
      capture(zone, e.pointerId);
      const r = zone.getBoundingClientRect();
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.base.style.left = `${e.clientX - r.left}px`;
      this.base.style.top = `${e.clientY - r.top}px`;
      this.base.classList.add('live');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
      this.x = dx / STICK_R;
      this.y = dy / STICK_R;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.id) this.reset(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  reset() {
    this.id = -1;
    this.x = this.y = 0;
    this.knob.style.transform = '';
    this.base.style.left = this.base.style.top = '';
    this.base.classList.remove('live');
  }
}

class HoldButton {
  on = false;
  private node: HTMLElement;

  constructor(parent: HTMLElement, label: string, cls: string, onUse: () => void) {
    this.node = el('div', `tb ${cls}`, parent, label);
    this.node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onUse();
      capture(this.node, e.pointerId);
      this.set(true);
    });
    const up = () => this.set(false);
    this.node.addEventListener('pointerup', up);
    this.node.addEventListener('pointercancel', up);
    this.node.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  set(on: boolean) {
    this.on = on;
    this.node.classList.toggle('down', on);
  }
}

/** On-screen controls: one pad per role, shown for the roles played on this device. */
export class Touch {
  enabled: boolean;
  /** Forced on with ?touch=1 (for trying the controls with a mouse). */
  private forced: boolean;
  private roles: Role[] | null = null;
  private pads: Record<Role, HTMLElement>;
  private legStick: Stick;
  private armStick: Stick;
  private jump: HoldButton;
  private grab: HoldButton;
  private throwB: HoldButton;
  private near: HoldButton;
  private far: HoldButton;

  constructor(private root: HTMLElement, onUse: () => void) {
    this.forced = new URLSearchParams(location.search).has('touch');
    this.enabled = this.forced || matchMedia('(pointer: coarse)').matches;

    const legs = el('div', 'pad', root);
    this.legStick = new Stick(legs, onUse);
    const lb = el('div', 'btns one', legs);
    this.jump = new HoldButton(lb, 'Jump', 'big', onUse);

    const arms = el('div', 'pad', root);
    this.armStick = new Stick(arms, onUse);
    const ab = el('div', 'btns', arms);
    this.near = new HoldButton(ab, '− Reach', 'small', onUse);
    this.far = new HoldButton(ab, '+ Reach', 'small', onUse);
    this.grab = new HoldButton(ab, 'Grab', '', onUse);
    this.throwB = new HoldButton(ab, 'Throw', '', onUse);

    this.pads = { legs, arms };
    this.apply();
  }

  /** Which roles this device plays right now; null hides the controls (menus). */
  show(roles: Role[] | null) {
    this.roles = roles;
    this.apply();
  }

  setEnabled(on: boolean) {
    on = on || this.forced;
    if (on === this.enabled) return;
    this.enabled = on;
    this.apply();
  }

  private apply() {
    const visible = this.enabled && !!this.roles;
    document.body.classList.toggle('touch', this.enabled);
    this.root.classList.toggle('hidden', !visible);
    this.root.classList.toggle('both', this.roles?.length === 2);
    for (const role of ['legs', 'arms'] as Role[]) {
      this.pads[role].classList.toggle('hidden', !this.roles?.includes(role));
    }
    if (!visible) {
      this.legStick.reset();
      this.armStick.reset();
      for (const b of [this.jump, this.grab, this.throwB, this.near, this.far]) b.set(false);
    }
  }

  legs(): LegsInput {
    return { mx: this.legStick.x, mz: this.legStick.y, jump: this.jump.on };
  }

  arms(): ArmsInput {
    return {
      ax: this.armStick.x,
      ay: -this.armStick.y + 0,
      reach: (this.far.on ? 1 : 0) - (this.near.on ? 1 : 0),
      grab: this.grab.on,
      throw: this.throwB.on,
    };
  }
}
