import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../shared/protocol.ts';
import type { Sfx } from '../audio/Sfx.ts';
import type { LevelDef } from '../game/level1.ts';
import { Effects } from './Effects.ts';
import { LevelView } from './LevelView.ts';
import { MonsterView } from './MonsterView.ts';

const CONFETTI = [0, 1, 2, 3, 5];

/** Owns the Three.js scene and turns snapshots + events into pictures and sounds. */
export class GameView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  private sun = new THREE.DirectionalLight(0xfff4dd, 2.4);
  private levelView: LevelView;
  private monster = new MonsterView();
  private effects: Effects;
  private camPos = new THREE.Vector3(0, 10, 18);
  private camLook = new THREE.Vector3(0, 1, 0);
  private time = 0;
  private confetti = 0;

  constructor(private container: HTMLElement, overlay: HTMLElement, level: LevelDef, private sfx: Sfx) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x8fdcff);
    this.scene.fog = new THREE.Fog(0x8fdcff, 45, 130);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x88aacc, 1.5));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.levelView = new LevelView(level);
    this.scene.add(this.levelView.group, this.monster.root, this.monster.arms);
    this.effects = new Effects(this.scene, this.camera, overlay);
    this.monster.onStep = () => this.sfx.play('step');

    const resize = () => {
      const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();
  }

  reset() {
    this.effects.clear();
    this.confetti = 0;
  }

  handleEvents(events: GameEvent[]) {
    const fx = this.effects;
    for (const e of events) {
      const p = e.p ?? [0, 0, 0];
      this.sfx.play(e.k);
      switch (e.k) {
        case 'land':
          fx.burst([p[0], p[1] - 1.4, p[2]], 8, [6, 4], 5, 1.5);
          if (e.txt) { fx.popup(e.txt, p); fx.shake(0.35); }
          break;
        case 'bonk': fx.popup(e.txt!, p, 'big'); fx.burst(p, 16, [0, 4], 7, 5); fx.shake(0.5); break;
        case 'star': fx.popup('+ STAR', p, 'gold'); fx.burst(p, 18, [0, 4], 5, 4); break;
        case 'lever': fx.popup(e.txt!, p); fx.burst(p, 8, [0, 2], 3, 2); break;
        case 'plate': if (e.txt) fx.popup(e.txt, [p[0], p[1] - 1, p[2]]); break;
        case 'target': fx.popup(e.txt!, p, 'big gold'); fx.burst(p, 40, CONFETTI, 8, 6); fx.shake(0.3); break;
        case 'checkpoint': fx.popup(e.txt!, p, 'green'); break;
        case 'fumble': fx.popup(e.txt!, p, 'big'); fx.shake(0.4); break;
        case 'chaos': fx.popup(e.txt!, p, 'big purple'); fx.burst(p, 20, [5, 3, 4], 8, 4); fx.shake(0.45); break;
        case 'hic': fx.popup(e.txt!, p); break;
        case 'pop': fx.burst(p, 10, [4, 2], 3, 2); break;
        case 'throw': fx.burst(p, 6, [4], 3, 1); break;
        case 'roar':
          fx.popup(e.txt!, p, 'big purple');
          fx.ring([p[0], p[1] - 1.3, p[2]], 5, 9);
          fx.ring([p[0], p[1] - 0.6, p[2]], 4, 6);
          fx.shake(0.5);
          break;
        case 'stomp': {
          const big = e.txt === 'STOMP!';
          fx.popup(e.txt!, p, big ? 'big' : '');
          fx.ring([p[0], p[1] + 0.1, p[2]], 0, big ? 5 : 2.5);
          fx.burst(p, big ? 18 : 8, [6, 4], 6, 2);
          fx.shake(big ? 0.6 : 0.2);
          break;
        }
        case 'smash': fx.popup(e.txt!, p, 'big'); fx.burst(p, 70, [6, 4, 6], 10, 6); fx.shake(0.6); break;
        case 'button': fx.popup(e.txt!, p, 'gold'); fx.burst(p, 20, [3, 0], 5, 5); break;
        case 'finish': fx.popup(e.txt!, p, 'big gold'); this.confetti = 4; fx.shake(0.4); break;
      }
    }
  }

  render(s: Snapshot, dt: number) {
    this.time += dt;
    this.levelView.apply(s, dt, this.time);
    this.monster.update(s, dt, this.time);

    const [mx, my, mz] = s.m;
    if (this.confetti > 0) {
      this.confetti -= dt;
      this.effects.burst([mx + (Math.random() - 0.5) * 9, my + 6, mz + (Math.random() - 0.5) * 5], 4, CONFETTI, 4, 2);
    }
    this.effects.update(dt);

    // Follow camera, behind and above, swinging a little with the head's gaze.
    const y = Math.max(my, -2);
    const k = Math.min(1, dt * 5);
    const gaze = s.g[0], swing = gaze * 0.35;
    this.camPos.lerp(new THREE.Vector3(mx * 0.55 - Math.sin(swing) * 13.5, y + 8.5, mz + Math.cos(swing) * 13.5), k);
    this.camLook.lerp(new THREE.Vector3(mx * 0.8 + Math.sin(gaze) * 3.5, y + 0.6, mz - Math.cos(gaze) * 3.5), k);
    const sh = this.effects.shakeAmount;
    this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    this.camera.lookAt(this.camLook);

    this.sun.position.set(mx + 9, 22, mz + 8);
    this.sun.target.position.set(mx, 0, mz - 4);
    this.renderer.render(this.scene, this.camera);
  }
}
