import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
}

const COLORS = [0xffd23f, 0xff5d8f, 0x4dd0e1, 0x9bf06b, 0xffffff, 0xb388ff, 0xd9c7a8];

/** Particles, floating comic text and screen shake. */
export class Effects {
  private pool: Particle[] = [];
  private mats = COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  private geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  private popups: { el: HTMLElement; pos: THREE.Vector3; life: number }[] = [];
  shakeAmount = 0;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private overlay: HTMLElement) {}

  /** colors: indices into the palette (0 yellow, 1 pink, 2 cyan, 3 green, 4 white, 5 purple, 6 dust) */
  burst(p: number[], count: number, colors: number[], speed = 5, up = 4) {
    for (let i = 0; i < count; i++) {
      let part = this.pool.find((q) => q.life <= 0);
      if (!part) {
        if (this.pool.length > 400) return;
        part = { mesh: new THREE.Mesh(this.geo, this.mats[0]), vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1 };
        this.scene.add(part.mesh);
        this.pool.push(part);
      }
      part.mesh.material = this.mats[colors[i % colors.length]];
      part.mesh.position.set(p[0], p[1], p[2]);
      part.mesh.visible = true;
      part.vel.set((Math.random() - 0.5) * speed, Math.random() * up + up * 0.4, (Math.random() - 0.5) * speed);
      part.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      part.life = part.max = 0.7 + Math.random() * 0.8;
    }
  }

  popup(text: string, p: number[], cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    el.style.setProperty('--tilt', `${(Math.random() - 0.5) * 24}deg`);
    this.overlay.appendChild(el);
    this.popups.push({ el, pos: new THREE.Vector3(p[0], p[1] + 2.2, p[2]), life: 1.3 });
  }

  shake(a: number) {
    this.shakeAmount = Math.max(this.shakeAmount, a);
  }

  clear() {
    for (const p of this.popups) p.el.remove();
    this.popups = [];
    for (const p of this.pool) { p.life = 0; p.mesh.visible = false; }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(Math.max(0.01, p.life / p.max) * 1.6);
      if (p.life <= 0) p.mesh.visible = false;
    }
    const v = new THREE.Vector3();
    const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
    this.popups = this.popups.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) { p.el.remove(); return false; }
      p.pos.y += dt * 1.2;
      v.copy(p.pos).project(this.camera);
      p.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      p.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      p.el.style.opacity = String(Math.min(1, p.life * 2.5));
      p.el.style.display = v.z < 1 ? '' : 'none';
      return true;
    });
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.6);
  }
}
