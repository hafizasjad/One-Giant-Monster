import type { SpecialInput } from '../../shared/protocol.ts';
import type { Simulation } from './Simulation.ts';

export const ROAR_CD = 4;
export const STOMP_CD = 3;

/** The Special player's two abilities, each on a cooldown. */
export class Special {
  roarCd = 0;
  stompCd = 0;
  /** 0 = not stomping, 1 = little stomp (started on the ground), 2 = big stomp (started in the air) */
  slam = 0;
  private prevRoar = false;
  private prevStomp = false;

  step(dt: number, input: SpecialInput, sim: Simulation) {
    this.roarCd = Math.max(0, this.roarCd - dt);
    this.stompCd = Math.max(0, this.stompCd - dt);

    if (input.roar && !this.prevRoar && this.roarCd === 0) {
      this.roarCd = ROAR_CD;
      sim.roar();
    }
    if (input.stomp && !this.prevStomp && this.stompCd === 0 && !this.slam) {
      this.stompCd = STOMP_CD;
      const m = sim.monster;
      if (m.grounded) {
        m.hop(6);
        this.slam = 1;
      } else {
        m.vy = -30;
        this.slam = 2;
      }
    }
    this.prevRoar = input.roar;
    this.prevStomp = input.stomp;
  }

  /** Call after the monster has moved: finishes a stomp when it touches down. */
  landed(sim: Simulation) {
    if (!this.slam || !sim.monster.grounded) return;
    sim.shock(this.slam === 2);
    this.slam = 0;
  }
}
