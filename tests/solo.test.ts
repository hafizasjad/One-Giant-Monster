import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { emptyArms, type ArmsInput } from '../shared/protocol.ts';
import { Bots } from '../src/game/Bots.ts';
import { Simulation } from '../src/game/Simulation.ts';

beforeAll(async () => {
  await RAPIER.init();
});

/** A stand-in for the human: does what the hint asks, with the arms only. */
class ArmsPlayer {
  private n = 0;
  private charging = 0;

  step(sim: Simulation, bots: Bots): ArmsInput {
    this.n++;
    const a = emptyArms();
    const y = sim.arms.local.y;
    const tap = this.n % 30 === 0;
    const move = (to: number) => { a.ay = Math.abs(to - y) > 0.15 ? Math.sign(to - y) : 0; return a.ay === 0; };

    if (bots.task !== 'carry-ball') this.charging = 0;
    switch (bots.task) {
      case 'lever':
        if (bots.ready && move(3.2)) a.grab = tap;
        break;
      case 'fetch-crate':
      case 'fetch-ball':
        a.reach = 1;
        if (bots.ready && move(0.6)) a.grab = tap;
        break;
      case 'carry-crate':
        a.reach = 1;
        move(1.6);
        if (bots.ready) a.grab = tap;
        break;
      case 'carry-ball':
        move(2.9);
        if (bots.ready) {
          this.charging++;
          a.throw = this.charging < 28; // about half power, then let go
        }
        break;
    }
    return a;
  }
}

function play(seed: number, chaos: boolean) {
  const sim = new Simulation(RAPIER, { chaos, seed });
  const bots = new Bots();
  const player = new ArmsPlayer();
  const log: string[] = [];
  let last = '';
  for (let n = 0; n < 60 * 300 && !sim.finished; n++) {
    bots.step(sim);
    const arms = player.step(sim, bots);
    sim.step({ legs: bots.legs, arms, head: bots.head, special: bots.special });
    const state = `${bots.task}${bots.ready ? '!' : ''}`;
    if (state !== last) { log.push(`${(n / 60).toFixed(1)}s z=${sim.monster.pos.z.toFixed(1)} ${state}`); last = state; }
  }
  const trace = `seed ${seed}: ` + log.slice(-20).join(' | ') + ` fumbles=${sim.fumbles} z=${sim.monster.pos.z.toFixed(1)}`;
  return { sim, trace };
}

describe('solo: one arms player, everything else on autopilot', () => {
  it.each([1, 2, 3, 4, 5])('finishes the whole course (boulder seed %i)', (seed) => {
    const { sim, trace } = play(seed, false);
    expect(sim.finished, trace).toBe(true);
    expect(sim.fumbles, trace).toBeLessThan(4);
    expect(sim.playTime).toBeLessThan(200);
  });

  it.each([11, 12, 13])('still finishes with the silly events on (seed %i)', (seed) => {
    const { sim, trace } = play(seed, true);
    expect(sim.finished, trace).toBe(true);
  });
});
