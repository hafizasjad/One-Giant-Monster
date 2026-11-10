import type { Simulation } from './Simulation.ts';

export const CHAOS_LABEL: Record<string, string> = {
  sneeze: 'ACHOO! Giant sneeze!',
  hiccups: 'Hic! Hiccups!',
  slick: 'Banana feet! So slippery!',
  noodle: 'Noodle arms! Extra stretchy!',
  burp: 'BUUURP!',
};
const NAMES = Object.keys(CHAOS_LABEL);
const DURATION: Record<string, number> = { sneeze: 0.6, hiccups: 3.2, slick: 5, noodle: 7, burp: 0.6 };

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Occasional telegraphed silly events. Runs only on the host. */
export class Chaos {
  cur: { name: string; warn: boolean; t: number } | null = null;
  rng: () => number;
  private timer = 16;
  private hic = 0;
  private last = '';

  constructor(seed: number, public enabled: boolean) {
    this.rng = mulberry32(seed);
  }

  step(dt: number, sim: Simulation) {
    if (!this.enabled || sim.finished) {
      if (this.cur) this.end(sim);
      return;
    }
    if (!this.cur) {
      this.timer -= dt;
      if (this.timer <= 0) {
        let name = this.last;
        while (name === this.last) name = NAMES[Math.floor(this.rng() * NAMES.length)];
        this.last = name;
        this.cur = { name, warn: true, t: 1.5 };
        sim.emit('chaos-warn');
      }
      return;
    }
    const c = this.cur;
    c.t -= dt;
    if (c.warn) {
      if (c.t <= 0) {
        c.warn = false;
        c.t = DURATION[c.name];
        this.begin(c.name, sim);
      }
      return;
    }
    if (c.name === 'hiccups') {
      this.hic -= dt;
      if (this.hic <= 0 && sim.monster.grounded) {
        this.hic = 0.7;
        sim.monster.hop(5.5);
        sim.emit('hic', sim.monster.pos, 'hic!');
      }
    }
    if (c.t <= 0) this.end(sim);
  }

  private begin(name: string, sim: Simulation) {
    const m = sim.monster, f = m.forward;
    sim.emit('chaos', m.pos, CHAOS_LABEL[name]);
    if (name === 'sneeze') {
      m.knock(-f.x * 7, 7, -f.z * 7);
      sim.arms.drop(sim.armsWorld);
    } else if (name === 'burp') {
      m.knock(-f.x * 10, 3, -f.z * 10);
    } else if (name === 'slick') {
      m.slick = true;
    } else if (name === 'noodle') {
      sim.arms.reachScale = 1.7;
    } else if (name === 'hiccups') {
      this.hic = 0;
    }
  }

  private end(sim: Simulation) {
    sim.monster.slick = false;
    sim.arms.reachScale = 1;
    this.cur = null;
    this.timer = 12 + this.rng() * 10;
  }
}
