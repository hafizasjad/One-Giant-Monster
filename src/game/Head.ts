import type { HeadInput } from '../../shared/protocol.ts';
import type { Monster } from './Monster.ts';

export const GAZE_RADIUS = 2.4;
const SWING = 1.6; // rad/s
const SLIDE = 7; // units/s

/**
 * Where the monster is looking: a spot on the ground steered by the Head player.
 * Ghost things only exist while the spot is on them.
 */
export class Head {
  yaw = 0; // 0 = straight down the course (-Z), + = to the right
  dist = 5;
  spot = { x: 0, y: 0, z: 0 };
  private planeY = 0;

  step(dt: number, input: HeadInput, m: Monster) {
    this.yaw = Math.max(-1.2, Math.min(1.2, this.yaw + input.lx * SWING * dt));
    this.dist = Math.max(2, Math.min(14, this.dist + input.ly * SLIDE * dt));
    if (m.grounded) this.planeY = m.feetY;
    this.spot = {
      x: m.pos.x + Math.sin(this.yaw) * this.dist,
      y: this.planeY,
      z: m.pos.z - Math.cos(this.yaw) * this.dist,
    };
  }

  sees(x: number, y: number, z: number) {
    return Math.hypot(x - this.spot.x, z - this.spot.z) < GAZE_RADIUS && Math.abs(y - this.spot.y) < 7;
  }
}
