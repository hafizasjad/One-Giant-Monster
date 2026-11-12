import * as THREE from 'three';
import type { Snapshot } from '../../shared/protocol.ts';
import { MONSTER_Y, type EntityDef, type LevelDef, type Theme } from '../game/level1.ts';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const checker = canvasTexture(64, (g, s) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
});
checker.wrapS = checker.wrapT = THREE.RepeatWrapping;

const crateTex = canvasTexture(64, (g, s) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#b9b9b9'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
  g.lineWidth = 5; g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
});

function sign(text: string, color = '#ff4f8b') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  let px = 72;
  g.font = `900 ${px}px "Trebuchet MS", sans-serif`;
  // Long texts shrink to fit instead of being cut off.
  const w = g.measureText(text).width;
  if (w > 480) { px = Math.floor(px * 480 / w); g.font = `900 ${px}px "Trebuchet MS", sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#ffffff'; g.lineJoin = 'round';
  g.strokeText(text, 256, 68);
  g.fillStyle = color; g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(4.4, 1.1, 1);
  return sp;
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.55 : 0.24, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  g.center();
  return g;
}

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

const part = (g: THREE.BufferGeometry, color: number, y: number, x = 0, z = 0) => {
  const m = new THREE.Mesh(g, std(color, { flatShading: true }));
  m.position.set(x, y, z);
  return m;
};

/** A little floating island: flat top, rocky point underneath. */
function island(top: number, under: number, r: number) {
  const g = new THREE.Group();
  const rock = part(new THREE.ConeGeometry(r * 0.85, r * 1.6, 9), under, -0.6 - r * 0.8);
  rock.rotation.x = Math.PI;
  g.add(part(new THREE.CylinderGeometry(r, r * 0.85, 0.6, 9), top, -0.3), rock);
  return g;
}

/** Scenery pieces, one builder per theme. They are only looked at, never touched. */
const PROPS: Record<NonNullable<Theme['scenery']>, (rnd: () => number) => THREE.Group> = {
  trees(rnd) {
    const g = island(0x8fd66a, 0x9a7b5a, 2.4);
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * 2.6, z = (rnd() - 0.5) * 2.6, h = 0.8 + rnd() * 0.8;
      g.add(part(new THREE.CylinderGeometry(0.14, 0.2, h, 6), 0x8a5a3a, h / 2, x, z));
      g.add(part(new THREE.IcosahedronGeometry(0.7 + rnd() * 0.4, 1), [0x4fbf5a, 0x6fd06a, 0xff9ecb][Math.floor(rnd() * 3)], h + 0.6, x, z));
    }
    return g;
  },
  pines(rnd) {
    const g = island(0xf4f8ff, 0x9cc4e8, 2.2);
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * 2.4, z = (rnd() - 0.5) * 2.4, s = 0.8 + rnd() * 0.6;
      g.add(part(new THREE.CylinderGeometry(0.12, 0.16, 0.6 * s, 6), 0x7a5a3a, 0.3 * s, x, z));
      g.add(part(new THREE.ConeGeometry(0.8 * s, 1.7 * s, 7), 0x3f8f6a, 1.4 * s, x, z));
      g.add(part(new THREE.ConeGeometry(0.5 * s, 1.0 * s, 7), 0xffffff, 2.2 * s, x, z));
    }
    return g;
  },
  pillars(rnd) {
    const g = new THREE.Group();
    const h = 7 + rnd() * 6, r = 1.1 + rnd() * 0.8;
    g.add(part(new THREE.CylinderGeometry(r, r * 1.3, h, 7), 0xd98a5a, -h / 2));
    g.add(part(new THREE.CylinderGeometry(r * 1.15, r, 0.5, 7), 0xf2b27a, 0.25));
    if (rnd() > 0.4) { // a cactus on top
      g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 7), 0x4fa86a, 1.2));
      g.add(part(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 7), 0x4fa86a, 1.3, 0.45));
    }
    return g;
  },
  balloons(rnd) {
    const g = new THREE.Group();
    const color = [0xff5d8f, 0xffd23f, 0x58c4ff, 0x7ee081, 0xff8a3d][Math.floor(rnd() * 5)];
    const top = part(new THREE.SphereGeometry(1.7, 12, 10), color, 3);
    top.scale.y = 1.15;
    g.add(top, part(new THREE.ConeGeometry(1.1, 1.4, 12), color, 1.2), part(new THREE.BoxGeometry(0.7, 0.6, 0.7), 0x8a5a3a, 0));
    g.children[1].rotation.x = Math.PI;
    return g;
  },
};

export class LevelView {
  group = new THREE.Group();
  private floaters: { o: THREE.Object3D; y: number; p: number }[] = [];
  private meshes: THREE.Mesh[] = [];
  private levers: THREE.Group[] = [];
  private leverAngles: number[] = [];
  private plates: THREE.Mesh[] = [];
  private targets: THREE.Group[] = [];
  private stars: THREE.Mesh[] = [];
  private hammerArms: THREE.Mesh[] = [];
  private flags: THREE.Mesh[] = [];

  constructor(private level: LevelDef) {
    level.entities.forEach((e) => {
      const m = this.entityMesh(e);
      m.position.set(e.pos[0], e.pos[1], e.pos[2]);
      this.meshes.push(m);
      this.group.add(m);
    });
    const L = level;

    // Levers on the wall
    for (const lv of L.levers) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.3), std(0x2f2a4a));
      base.position.set(lv.pos[0], lv.pos[1], lv.pos[2] - 0.2);
      const lever = new THREE.Group();
      lever.position.set(lv.pos[0], lv.pos[1], lv.pos[2] - 0.1);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 10), std(0xdddddd, { metalness: 0.4 }));
      stick.rotation.x = Math.PI / 2;
      stick.position.z = 0.45;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), std(0xffd23f, { emissive: 0x664400 }));
      knob.position.z = 0.9;
      lever.add(stick, knob);
      const pull = sign('PULL ME!');
      pull.position.set(lv.pos[0], lv.pos[1] + 1.7, lv.pos[2] + 0.3);
      this.levers.push(lever);
      this.leverAngles.push(-0.8);
      this.group.add(base, lever, pull);
    }

    // Pressure plates
    for (const pl of L.plates) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pl.half * 2, 0.16, pl.half * 2), std(0xff4f5e, { emissive: 0x330000 }));
      plate.position.set(pl.pos[0], pl.pos[1] + 0.08, pl.pos[2]);
      const put = sign('BOX GOES HERE', '#2bb3c0');
      put.position.set(pl.pos[0], pl.pos[1] + 2.6, pl.pos[2]);
      this.plates.push(plate);
      this.group.add(plate, put);
    }

    // Targets
    for (const tg of L.targets) {
      const target = new THREE.Group();
      target.position.set(tg.pos[0], tg.pos[1], tg.pos[2]);
      [[1.45, 0xff3b4e], [1.0, 0xffffff], [0.55, 0xff3b4e]].forEach(([r, c], i) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 32), std(c));
        ring.rotation.x = Math.PI / 2;
        ring.position.z = i * 0.05;
        target.add(ring);
      });
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, tg.pos[1], 0.3), std(0x7a5a3a));
      post.position.set(tg.pos[0], tg.pos[1] / 2, tg.pos[2] - 0.25);
      const hit = sign('HIT ME!');
      hit.position.set(tg.pos[0], tg.pos[1] + 2.3, tg.pos[2]);
      this.targets.push(target);
      this.group.add(target, post, hit);
    }

    for (const sg of L.signs) {
      const sp = sign(sg.text, sg.color);
      sp.position.set(sg.pos[0], sg.pos[1], sg.pos[2]);
      sp.scale.multiplyScalar(sg.scale ?? 1);
      this.group.add(sp);
    }

    // Stars
    const sg = starGeometry();
    const sm = std(0xffd23f, { emissive: 0xaa7700, roughness: 0.3 });
    for (const p of L.stars) {
      const s = new THREE.Mesh(sg, sm);
      s.position.set(p[0], p[1], p[2]);
      s.castShadow = true;
      this.stars.push(s);
      this.group.add(s);
    }

    // Hammer frames and arms
    for (const h of L.hammers) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 0.4), std(0x5b4a8a));
      beam.position.set(0, h.pivot[1], h.pivot[2]);
      this.group.add(beam);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, h.pivot[1] + 1, 0.4), std(0x5b4a8a));
        leg.position.set(sx * 5.8, (h.pivot[1] - 1) / 2, h.pivot[2]);
        this.group.add(leg);
      }
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h.len, 8), std(0x333344));
      this.hammerArms.push(arm);
      this.group.add(arm);
    }
    // Boulder chutes
    for (const B of L.boulders) {
      const chute = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.5), std(0x6d5a4a));
      chute.position.set(0, B.y + 2, B.z - 0.8);
      const danger = sign('ROCKS!', '#e63946');
      danger.position.set(0, B.y + 3.1, B.z - 0.8);
      this.group.add(chute, danger);
    }

    // Checkpoint flags
    for (const cp of L.checkpoints) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), std(0xffffff));
      const floorY = cp.pos[1] - MONSTER_Y;
      pole.position.set(-4.6, floorY + 1.5, cp.z);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06), std(0xbbbbbb));
      flag.position.set(-4.0, floorY + 2.6, cp.z);
      this.flags.push(flag);
      this.group.add(pole, flag);
    }

    // Finish arch
    const finishTex = canvasTexture(64, (g, s) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#222'; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
    });
    finishTex.wrapS = finishTex.wrapT = THREE.RepeatWrapping;
    finishTex.repeat.set(9, 1);
    const finishY = L.finishY ?? 0;
    for (const sx of L.noFinish ? [] : [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 12), std(0xff5d8f));
      p.position.set(sx * 4.6, finishY + 3, L.finishZ);
      this.group.add(p);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.1, 0.2), new THREE.MeshStandardMaterial({ map: finishTex }));
    banner.position.set(0, finishY + 5.6, L.finishZ);
    const line = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 1), new THREE.MeshStandardMaterial({ map: finishTex }));
    line.position.set(0, finishY + 0.02, L.finishZ);
    if (!L.noFinish) this.group.add(banner, line);

    // Clouds drifting below the course
    const cloudMat = new THREE.MeshStandardMaterial({ color: L.theme?.clouds ?? 0xffffff, roughness: 1 });
    const cg = new THREE.SphereGeometry(1, 10, 8);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(cg, cloudMat);
        puff.position.set(j * 1.5 - 2.2, rnd() * 0.6, rnd() * 1.2);
        puff.scale.setScalar(1.2 + rnd() * 1.3);
        cloud.add(puff);
      }
      const side = i % 2 ? 1 : -1;
      cloud.position.set(side * (15 + rnd() * 26), -7 - rnd() * 10, 10 - rnd() * (30 - L.finishZ));
      cloud.scale.setScalar(0.8 + rnd() * 1.1);
      this.group.add(cloud);
    }

    // Scenery floating on both sides, clear of the course
    const kind = L.theme?.scenery;
    if (kind) {
      const fixed = L.entities.filter((e) => e.body === 'fixed');
      const halfW = Math.max(5, ...fixed.map((e) => Math.abs(e.pos[0]) + e.half[0]));
      const zFar = Math.min(...fixed.map((e) => e.pos[2] - e.half[2])) - 12;
      const count = Math.ceil((12 - zFar) / 6);
      for (let i = 0; i < count; i++) {
        const prop = PROPS[kind](rnd);
        const y = kind === 'balloons' ? 2 + rnd() * 12 : -1.5 - rnd() * 5;
        prop.position.set((i % 2 ? 1 : -1) * (halfW + 6 + rnd() * 15), y, 12 - (i + rnd()) * 6);
        prop.rotation.y = rnd() * Math.PI * 2;
        prop.scale.setScalar(0.8 + rnd() * 0.8);
        this.floaters.push({ o: prop, y, p: rnd() * 6 });
        this.group.add(prop);
      }
    }
  }

  /** Free the GPU memory of this level's meshes (shared textures are kept). */
  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
    });
  }

  private entityMesh(e: EntityDef) {
    let m: THREE.Mesh;
    if (e.shape === 'ball') {
      const geo = e.tag === 'boulder' ? new THREE.IcosahedronGeometry(e.half[0], 1) : new THREE.SphereGeometry(e.half[0], 20, 16);
      m = new THREE.Mesh(geo, std(e.color, { flatShading: e.tag === 'boulder', roughness: e.tag === 'ball' ? 0.35 : 0.9 }));
    } else {
      const geo = new THREE.BoxGeometry(e.half[0] * 2, e.half[1] * 2, e.half[2] * 2);
      let material: THREE.Material | THREE.Material[];
      if (e.tag === 'ground') {
        const top = checker.clone();
        top.repeat.set(e.half[0] / 2, e.half[2] / 2);
        top.needsUpdate = true;
        const side = std(new THREE.Color(e.color).multiplyScalar(0.6).getHex());
        material = [side, side, std(e.color, { map: top }), side, side, side];
      } else if (e.tag === 'ice') {
        const side = std(new THREE.Color(e.color).multiplyScalar(0.7).getHex());
        material = [side, side, std(e.color, { roughness: 0.08, metalness: 0.15 }), side, side, side];
      } else if (e.tag === 'crate') {
        material = std(e.color, { map: crateTex });
      } else {
        material = std(e.color);
      }
      m = new THREE.Mesh(geo, material);
    }
    m.castShadow = e.tag !== 'ground' && e.tag !== 'ice';
    m.receiveShadow = true;
    return m;
  }

  apply(s: Snapshot, dt: number, time: number) {
    const L = this.level;
    L.movable.forEach((id, n) => {
      const m = this.meshes[id], o = n * 7;
      m.visible = s.b[o + 1] > -40;
      m.position.set(s.b[o], s.b[o + 1], s.b[o + 2]);
      m.quaternion.set(s.b[o + 3], s.b[o + 4], s.b[o + 5], s.b[o + 6]).normalize();
    });

    const nL = L.levers.length, nP = L.plates.length;
    this.levers.forEach((lever, i) => {
      this.leverAngles[i] += ((s.s[i] ? 0.8 : -0.8) - this.leverAngles[i]) * Math.min(1, dt * 14);
      lever.rotation.x = this.leverAngles[i];
    });

    this.plates.forEach((plate, i) => {
      const on = s.s[nL + i];
      const pm = plate.material as THREE.MeshStandardMaterial;
      pm.color.setHex(on ? 0x58e06a : 0xff4f5e);
      pm.emissive.setHex(on ? 0x0a4a12 : 0x330000);
      plate.position.y = L.plates[i].pos[1] + (on ? 0.02 : 0.08);
    });

    this.targets.forEach((target, i) => {
      const hit = s.s[nL + nP + i];
      target.rotation.z += dt * (hit ? 10 : 0);
      target.scale.setScalar(hit ? 0.8 : 1 + Math.sin(time * 4) * 0.05);
    });

    this.stars.forEach((st, i) => {
      st.visible = !(s.stars & (1 << i));
      st.rotation.y = time * 2 + i;
      st.position.y = L.stars[i][1] + Math.sin(time * 3 + i) * 0.15;
    });

    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    L.hammers.forEach((h, i) => {
      const head = this.meshes[h.head].position;
      d.set(head.x - h.pivot[0], head.y - h.pivot[1], head.z - h.pivot[2]);
      const arm = this.hammerArms[i];
      arm.position.set(h.pivot[0] + d.x / 2, h.pivot[1] + d.y / 2, h.pivot[2] + d.z / 2);
      arm.quaternion.setFromUnitVectors(up, d.normalize());
      this.meshes[h.head].quaternion.copy(arm.quaternion);
    });

    for (const f of this.floaters) f.o.position.y = f.y + Math.sin(time * 0.7 + f.p) * 0.35;

    this.flags.forEach((f, i) => {
      (f.material as THREE.MeshStandardMaterial).color.setHex(i <= s.cp ? 0x58e06a : 0xbbbbbb);
      f.rotation.y = Math.sin(time * 5 + i) * 0.2;
    });
  }
}
