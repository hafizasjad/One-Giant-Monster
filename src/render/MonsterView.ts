import * as THREE from 'three';
import type { Snapshot } from '../../shared/protocol.ts';

const BODY = 0x7c5cff, BELLY = 0xcbbcff, PAW = 0xffb14e, HORN = 0xfff1c1;
const ARM_SEGMENTS = 9;
const FEET_OFFSET = 1.5; // capsule centre -> feet

const mat = (color: number, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });

/** A blobby monster built from primitives and animated procedurally from snapshots. */
export class MonsterView {
  root = new THREE.Group(); // at the feet, rotated by yaw
  arms = new THREE.Group(); // world-space noodle arms
  private torso = new THREE.Group();
  private legs: THREE.Group[] = [];
  private pupils: THREE.Mesh[] = [];
  private eyes: THREE.Mesh[] = [];
  private jaw: THREE.Mesh;
  private armBalls: THREE.Mesh[][] = [[], []];
  private hands: THREE.Mesh[] = [];
  private walk = 0;
  private squash = 0; // spring displacement
  private squashV = 0;
  private wasGrounded = true;
  private lastStep = 0;
  private blink = 2;
  onStep: (() => void) | null = null;

  constructor() {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat(BODY));
    body.scale.set(1.02, 1.22, 0.95);
    body.position.y = 1.65;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 18), mat(BELLY));
    belly.scale.set(0.95, 1.05, 0.55);
    belly.position.set(0, 1.35, 0.52);
    this.torso.add(body, belly);

    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.33, 20, 16), mat(0xffffff, 0.25));
      eye.position.set(sx * 0.37, 2.28, 0.74);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), mat(0x1b1330, 0.2));
      pupil.position.set(0, 0, 0.25);
      eye.add(pupil);
      this.eyes.push(eye);
      this.pupils.push(pupil);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 12), mat(HORN));
      horn.position.set(sx * 0.5, 2.85, 0.1);
      horn.rotation.z = -sx * 0.45;
      this.torso.add(eye, horn);
    }
    this.jaw = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), mat(0x3a1140, 0.5));
    this.jaw.scale.set(1.25, 0.32, 0.5);
    this.jaw.position.set(0, 1.78, 0.86);
    this.torso.add(this.jaw);
    for (const sx of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), mat(0xffffff, 0.3));
      tooth.position.set(sx * 0.26, 1.72, 1.03);
      this.torso.add(tooth);
    }
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), mat(PAW));
      spike.position.set(0, 2.4 - i * 0.5, -0.82 - (i === 1 ? 0.12 : 0));
      spike.rotation.x = -1.2;
      this.torso.add(spike);
    }
    this.root.add(this.torso);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.48, 0.75, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.6, 14), mat(BODY));
      thigh.position.y = -0.3;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), mat(PAW));
      foot.scale.set(1, 0.55, 1.45);
      foot.position.set(0, -0.58, 0.14);
      leg.add(thigh, foot);
      this.legs.push(leg);
      this.root.add(leg);
    }

    const ballGeo = new THREE.SphereGeometry(1, 12, 10);
    const armMat = mat(BODY), handMat = mat(PAW);
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < ARM_SEGMENTS; i++) {
        const b = new THREE.Mesh(ballGeo, armMat);
        b.scale.setScalar(0.24 - i * 0.008);
        b.castShadow = true;
        this.armBalls[side].push(b);
        this.arms.add(b);
      }
      const hand = new THREE.Mesh(ballGeo, handMat);
      hand.scale.set(0.36, 0.3, 0.36);
      hand.castShadow = true;
      this.hands.push(hand);
      this.arms.add(hand);
    }
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  update(s: Snapshot, dt: number, time: number) {
    const [x, y, z, yaw, speed, grounded, vy] = s.m;
    const [hx, hy, hz, held, charge] = s.h;
    const k = Math.min(1, speed / 6);

    this.root.position.set(x, y - FEET_OFFSET, z);
    this.root.rotation.y = yaw;

    // Legs: scissor while walking, tuck while airborne.
    this.walk += dt * (4 + speed * 2.2) * (grounded ? k : 0.3);
    const swing = Math.sin(this.walk) * 0.9 * k;
    this.legs[0].rotation.x = grounded ? swing : -0.6;
    this.legs[1].rotation.x = grounded ? -swing : 0.5;
    const stepIdx = Math.floor(this.walk / Math.PI);
    if (grounded && k > 0.3 && stepIdx !== this.lastStep) this.onStep?.();
    this.lastStep = stepIdx;

    // Squash and stretch on a spring: kicked on take-off and landing.
    if (grounded && !this.wasGrounded) this.squashV = -4.5;
    if (!grounded && this.wasGrounded && vy > 2) this.squashV = 4;
    this.wasGrounded = !!grounded;
    this.squashV += (-this.squash * 120 - this.squashV * 9) * dt;
    this.squash += this.squashV * dt;
    const breathe = Math.sin(time * 2.2) * 0.015;
    const sy = 1 + this.squash + breathe + (grounded ? 0 : Math.max(-0.1, Math.min(0.15, vy * 0.012)));
    const sxz = 1 / Math.sqrt(Math.max(0.4, sy));
    this.torso.scale.set(sxz, sy, sxz);
    this.torso.position.y = Math.abs(Math.sin(this.walk)) * 0.12 * k;
    this.torso.rotation.x = k * 0.16 - charge * 0.3;
    this.torso.rotation.z = Math.sin(this.walk) * 0.07 * k;

    // Eyes follow the hand; blink now and then; mouth gapes when airborne or charging.
    this.root.updateMatrixWorld(true);
    const handLocal = this.root.worldToLocal(new THREE.Vector3(hx, hy, hz));
    const lx = Math.max(-1, Math.min(1, handLocal.x / 1.6));
    const ly = Math.max(-1, Math.min(1, (handLocal.y - 2.2) / 1.6));
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 1.5 + Math.random() * 3;
    for (const [i, p] of this.pupils.entries()) {
      p.position.set(lx * 0.13, ly * 0.13 + Math.sin(time * 9 + i) * 0.01 * (1 + k * 3), 0.25);
      this.eyes[i].scale.y = this.blink < 0 ? 0.1 : 1;
    }
    const open = Math.max(grounded ? 0 : 0.6, charge, held >= 0 ? 0.25 : 0);
    this.jaw.scale.y = 0.2 + open * 0.55;

    // Noodle arms: a sagging curve of beads from each shoulder to the hand.
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const spread = held >= 0 ? 0.62 : 0.24;
    const a = new THREE.Vector3(), c = new THREE.Vector3(), b = new THREE.Vector3();
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1; // -1: monster's left
      a.set(-sgn * 0.92, 1.95 * sy, 0.1).applyMatrix4(this.root.matrixWorld);
      b.set(hx, hy, hz).addScaledVector(right, sgn * spread);
      const len = a.distanceTo(b);
      const wobble = Math.sin(time * 7 + side * 2) * 0.08 * (1 + k * 2) + (Math.random() - 0.5) * charge * 0.25;
      c.copy(a).lerp(b, 0.5);
      c.y -= Math.max(0, 0.9 - len * 0.22) - wobble;
      c.addScaledVector(right, sgn * 0.35);
      for (let i = 0; i < ARM_SEGMENTS; i++) {
        const t = (i + 0.5) / (ARM_SEGMENTS + 0.5), u = 1 - t;
        this.armBalls[side][i].position.set(
          u * u * a.x + 2 * u * t * c.x + t * t * b.x,
          u * u * a.y + 2 * u * t * c.y + t * t * b.y,
          u * u * a.z + 2 * u * t * c.z + t * t * b.z,
        );
      }
      this.hands[side].position.copy(b);
      this.hands[side].rotation.y = yaw;
    }
  }
}
