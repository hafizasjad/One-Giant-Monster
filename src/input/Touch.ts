import type { ArmsInput, HeadInput, LegsInput, Role, SpecialInput } from '../../shared/protocol.ts';

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

  constructor(pad: HTMLElement, label: string, cls: string, onUse: () => void) {
    const zone = el('div', `zone ${cls}`, pad);
    const base = el('div', 'stick', zone);
    base.dataset.label = label;
    const knob = el('i', '', base);
    zone.addEventListener('pointerdown', (e) => {
      if (this.id !== -1) return;
      e.preventDefault();
      onUse();
      this.id = e.pointerId;
      capture(zone, e.pointerId);
      const r = zone.getBoundingClientRect();
      this.ox = e.clientX;
      this.oy = e.clientY;
      base.style.left = `${e.clientX - r.left}px`;
      base.style.top = `${e.clientY - r.top}px`;
      base.classList.add('live');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
      this.x = dx / STICK_R;
      this.y = dy / STICK_R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.id = -1;
      this.x = this.y = 0;
      knob.style.transform = '';
      base.style.left = base.style.top = '';
      base.classList.remove('live');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}

class HoldButton {
  on = false;

  constructor(parent: HTMLElement, label: string, cls: string, onUse: () => void) {
    const node = el('div', `tb ${cls}`, parent, label);
    const set = (on: boolean) => {
      this.on = on;
      node.classList.toggle('down', on);
    };
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onUse();
      capture(node, e.pointerId);
      set(true);
    });
    node.addEventListener('pointerup', () => set(false));
    node.addEventListener('pointercancel', () => set(false));
    node.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

type ButtonName = 'jump' | 'grab' | 'throw' | 'near' | 'far' | 'roar' | 'stomp';

/**
 * On-screen controls. Each panel is one person's corner of the screen and holds the
 * sticks and buttons for the roles played there.
 */
export class Touch {
  enabled: boolean;
  /** Forced on with ?touch=1 (for trying the controls with a mouse). */
  private forced: boolean;
  private panels: Role[][] | null = null;
  private sticks: Partial<Record<'legs' | 'arms' | 'head', Stick>> = {};
  private buttons: Partial<Record<ButtonName, HoldButton>> = {};

  constructor(private root: HTMLElement, private onUse: () => void) {
    this.forced = new URLSearchParams(location.search).has('touch');
    this.enabled = this.forced || matchMedia('(pointer: coarse)').matches;
    this.build();
  }

  /** One list of roles per panel (one or two panels); null hides the controls (menus). */
  show(panels: Role[][] | null) {
    this.panels = panels && panels.length ? panels : null;
    this.build();
  }

  setEnabled(on: boolean) {
    on = on || this.forced;
    if (on === this.enabled) return;
    this.enabled = on;
    this.build();
  }

  private build() {
    const visible = this.enabled && !!this.panels;
    document.body.classList.toggle('touch', this.enabled);
    this.root.classList.toggle('hidden', !visible);
    this.root.replaceChildren();
    this.sticks = {};
    this.buttons = {};
    if (!visible) return;
    this.root.classList.toggle('both', this.panels!.length === 2);

    for (const roles of this.panels!) {
      const pad = el('div', 'pad', this.root);
      const has = (r: Role) => roles.includes(r);
      const move = has('legs') ? 'legs' : has('arms') ? 'arms' : null;
      if (move) this.sticks[move] = new Stick(pad, move === 'legs' ? 'MOVE' : 'HAND', has('head') ? 'first' : 'wide', this.onUse);
      if (has('head')) this.sticks.head = new Stick(pad, 'LOOK', move ? 'second look' : 'wide look', this.onUse);

      const b = el('div', 'btns', pad);
      const add = (name: ButtonName, label: string, cls = '') => { this.buttons[name] = new HoldButton(b, label, cls, this.onUse); };
      if (has('special')) { add('roar', 'Roar', 'alt'); add('stomp', 'Stomp', 'alt'); }
      if (has('arms')) { add('near', '− Reach', 'small'); add('far', '+ Reach', 'small'); add('grab', 'Grab'); add('throw', 'Throw'); }
      if (has('legs')) add('jump', 'Jump', 'big');
    }
  }

  private on(name: ButtonName) {
    return !!this.buttons[name]?.on;
  }

  legs(): LegsInput {
    const s = this.sticks.legs;
    return { mx: s?.x ?? 0, mz: s?.y ?? 0, jump: this.on('jump') };
  }

  arms(): ArmsInput {
    const s = this.sticks.arms;
    return {
      ax: s?.x ?? 0,
      ay: -(s?.y ?? 0) + 0,
      reach: (this.on('far') ? 1 : 0) - (this.on('near') ? 1 : 0),
      grab: this.on('grab'),
      throw: this.on('throw'),
    };
  }

  head(): HeadInput {
    const s = this.sticks.head;
    return { lx: s?.x ?? 0, ly: -(s?.y ?? 0) + 0 };
  }

  special(): SpecialInput {
    return { roar: this.on('roar'), stomp: this.on('stomp') };
  }
}
