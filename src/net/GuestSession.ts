import type { ArmsInput, GameEvent, LegsInput, Role, Snapshot } from '../../shared/protocol.ts';
import type { Session } from './HostSession.ts';
import type { NetClient } from './NetClient.ts';

// Render a little behind the newest snapshot so there is always something to blend.
// How far behind follows the connection: steady links get the minimum, jittery ones more.
const MIN_DELAY = 0.08, MAX_DELAY = 0.3;
const INPUT_INTERVAL = 1 / 30;

/** The non-host player: sends its own input, draws interpolated snapshots from the host. */
export class GuestSession implements Session {
  private buf: Snapshot[] = [];
  private events: GameEvent[] = [];
  private offset: number | null = null; // local clock - sim clock
  private sendAcc = 0;
  private jitter = 0; // typical lateness of a snapshot, seconds
  private delay = 0.1;
  private lastSent = '';

  constructor(private net: NetClient, private role: Role, private input: () => LegsInput | ArmsInput) {}

  receive(s: Snapshot) {
    const last = this.buf[this.buf.length - 1];
    if (last && s.t < last.t - 1) this.clear(); // host restarted
    this.events.push(...s.ev);
    // The direct link does not keep order: a snapshot that was overtaken is of no use.
    if (this.buf.length && s.t <= this.buf[this.buf.length - 1].t) return;
    this.buf.push(s);
    if (this.buf.length > 30) this.buf.shift();
    const off = performance.now() / 1000 - s.t;
    if (this.offset === null) this.offset = off;
    else {
      this.jitter += (Math.abs(off - this.offset) - this.jitter) * 0.1;
      this.offset += (off - this.offset) * 0.05;
    }
  }

  clear() {
    this.buf = [];
    this.events = [];
    this.offset = null;
    this.jitter = 0;
  }

  update(dt: number): Snapshot | null {
    const i = this.input();
    const json = JSON.stringify(i);
    this.sendAcc += dt;
    if (json !== this.lastSent || this.sendAcc >= INPUT_INTERVAL) {
      this.net.send({ k: 'input', role: this.role, i });
      this.lastSent = json;
      this.sendAcc = 0;
    }

    if (!this.buf.length || this.offset === null) return null;
    const want = Math.max(MIN_DELAY, Math.min(MAX_DELAY, 0.06 + this.jitter * 3));
    this.delay += (want - this.delay) * Math.min(1, dt);
    const t = performance.now() / 1000 - this.offset - this.delay;
    let a = this.buf[0], b = this.buf[this.buf.length - 1];
    for (let n = this.buf.length - 1; n > 0; n--) {
      if (this.buf[n - 1].t <= t) { a = this.buf[n - 1]; b = this.buf[n]; break; }
    }
    if (t <= this.buf[0].t) b = a;
    const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
    const out = blend(a, b, k);
    out.ev = this.events;
    this.events = [];
    return out;
  }

  dispose() {}
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function blend(a: Snapshot, b: Snapshot, k: number): Snapshot {
  let dyaw = b.m[3] - a.m[3];
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  // A big jump means a respawn/teleport: snap instead of sliding across the level.
  const snap = Math.hypot(b.m[0] - a.m[0], b.m[1] - a.m[1], b.m[2] - a.m[2]) > 6;
  const km = snap ? 1 : k;
  const m = [lerp(a.m[0], b.m[0], km), lerp(a.m[1], b.m[1], km), lerp(a.m[2], b.m[2], km), a.m[3] + dyaw * km, b.m[4], b.m[5], b.m[6]];
  const h = [lerp(a.h[0], b.h[0], km), lerp(a.h[1], b.h[1], km), lerp(a.h[2], b.h[2], km), b.h[3], b.h[4]];
  const bodies = b.b.slice();
  for (let o = 0; o < bodies.length; o += 7) {
    const far = Math.abs(b.b[o] - a.b[o]) + Math.abs(b.b[o + 1] - a.b[o + 1]) + Math.abs(b.b[o + 2] - a.b[o + 2]) > 6;
    if (far) continue;
    for (let j = 0; j < 3; j++) bodies[o + j] = lerp(a.b[o + j], b.b[o + j], k);
    // nlerp the rotation along the short way round
    const dot = a.b[o + 3] * b.b[o + 3] + a.b[o + 4] * b.b[o + 4] + a.b[o + 5] * b.b[o + 5] + a.b[o + 6] * b.b[o + 6];
    const sgn = dot < 0 ? -1 : 1;
    for (let j = 3; j < 7; j++) bodies[o + j] = lerp(a.b[o + j], b.b[o + j] * sgn, k);
  }
  return { ...b, m, h, b: bodies, ev: [] };
}
