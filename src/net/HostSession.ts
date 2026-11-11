import type RAPIER from '@dimforge/rapier3d-compat';
import { emptyInputs, type ArmsInput, type GameEvent, type Inputs, type LegsInput, type Role, type Snapshot } from '../../shared/protocol.ts';
import type { LevelDef } from '../game/level1.ts';
import { DT, Simulation } from '../game/Simulation.ts';
import type { NetClient } from './NetClient.ts';

export interface Session {
  /** Advance and return the state to draw (events included once). */
  update(dt: number): Snapshot | null;
  dispose(): void;
}

export interface HostOptions {
  /** Inputs read from this machine. Roles left out come from the network (or stay idle). */
  local: () => Partial<Inputs>;
  net?: NetClient;
  chaos?: boolean;
  /** Builds the course to play (a fresh copy per run). Defaults to the first level. */
  level?: () => LevelDef;
}

const SEND_INTERVAL = 1 / 20;

/** Runs the authoritative simulation. Used for local play and by the online host. */
export class HostSession implements Session {
  sim: Simulation;
  /** Paused while the partner is missing (online only). */
  waiting = false;
  private acc = 0;
  private sendAcc = 0;
  private remote: Inputs = emptyInputs();
  private latchJump = false;
  private latchGrab = false;
  private outbox: GameEvent[] = [];
  private last: Snapshot;

  constructor(private R: typeof RAPIER, private opts: HostOptions) {
    this.sim = this.makeSim();
    this.last = this.sim.snapshot();
  }

  private makeSim() {
    return new Simulation(this.R, { chaos: this.opts.chaos ?? true, seed: (Math.random() * 1e9) | 0, level: this.opts.level?.() });
  }

  /** Called when the guest's input arrives. Quick taps are latched so none get lost between steps. */
  remoteInput(role: Role, i: LegsInput | ArmsInput) {
    if (role === 'legs') {
      this.remote.legs = i as LegsInput;
      if (this.remote.legs.jump) this.latchJump = true;
    } else {
      this.remote.arms = i as ArmsInput;
      if (this.remote.arms.grab) this.latchGrab = true;
    }
  }

  restart() {
    this.sim.dispose();
    this.sim = this.makeSim();
    this.acc = 0;
    this.remote = emptyInputs();
    this.opts.net?.send({ k: 'restart' });
  }

  update(dt: number): Snapshot {
    if (!this.waiting) {
      this.acc = Math.min(this.acc + dt, DT * 8);
      while (this.acc >= DT) {
        this.acc -= DT;
        const local = this.opts.local();
        const legs = local.legs ?? { ...this.remote.legs, jump: this.remote.legs.jump || this.latchJump };
        const arms = local.arms ?? { ...this.remote.arms, grab: this.remote.arms.grab || this.latchGrab };
        this.latchJump = this.latchGrab = false;
        this.sim.step({ legs, arms });
      }
    }
    this.last = this.sim.snapshot();

    const net = this.opts.net;
    if (net) {
      this.outbox.push(...this.last.ev);
      this.sendAcc += dt;
      if (this.sendAcc >= SEND_INTERVAL) {
        this.sendAcc = 0;
        net.send({ k: 'snap', s: { ...this.last, ev: this.outbox } });
        this.outbox = [];
      }
    }
    return this.last;
  }

  dispose() {
    this.sim.dispose();
  }
}
