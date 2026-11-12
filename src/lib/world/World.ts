import * as THREE from 'three';
import { Moon, studio, type MoonState } from './Moon';
import { Ribbon } from './Ribbon';
import { Cards } from './Cards';
import { Night } from './Night';

export type FrameHook = (t: number, dt: number) => void;

/**
 * The stage: one fixed WebGL canvas under the page's text, holding everything 3D in one scene laid
 * out in page space (1 unit = 1 CSS px, y up, the page's top at y = 0). An orthographic camera
 * follows the scroll, so objects sit exactly on their DOM slots and share one depth buffer: the
 * ribbon can orbit the moon, and thread in front of and behind the work.
 *
 * It draws only when something changed: the scroll, the moon, a card, a plucked ribbon.
 */
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  moon = new Moon();
  /** Black chrome: ink like the type, with the studio's light running along it. */
  ribbon = new Ribbon(matchMedia('(max-width: 860px)').matches ? 8 : 13);
  cards: Cards;
  /** The work's night, rising and setting behind everything. */
  night = new Night();
  moonState: MoonState = {
    rect: { x: 0, y: 0, w: 10 },
    lit: 0.75,
    tilt: { x: 0, y: 0 },
    light: { x: 0, y: 0 },
    alpha: 0,
    shadow: 1,
    night: 0,
    scale: 1,
  };
  /** Device pixel ratio ceiling; lowered a step if frames run long (see `frame`). */
  private dprCap = 2;
  private slow = 0;
  private settled = 0;
  private dirty = true;
  private lastY = -1;
  private lastLight = '';
  vw = innerWidth;
  vh = innerHeight;
  dpr = 1;
  pointer = { x: 0, y: 0, px: -1, py: -1 };
  time = 0;
  /** Scroll velocity in px per second, smoothed: the cards bend with it. */
  velocity = 0;
  hooks: FrameHook[] = [];
  readonly coarse = matchMedia('(pointer: coarse)').matches;

  /** `later`: leave the studio light (the costliest part) for `light()`, so the start can be spread over tasks. */
  constructor(public canvas: HTMLCanvasElement, later = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!later) this.light();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -6000, 6000);
    this.camera.position.z = 3000;
    this.cards = new Cards(this.renderer);
    this.scene.add(this.night.mesh, this.cards.group, this.ribbon.mesh, this.moon.root);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      this.pointer.px = e.clientX;
      this.pointer.py = e.clientY;
      this.pointer.x = (e.clientX / this.vw) * 2 - 1;
      this.pointer.y = (e.clientY / this.vh) * 2 - 1;
    }, { passive: true });
  }

  resize() {
    this.vw = innerWidth;
    this.vh = innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.vw, this.vh, false);
    this.camera.right = this.vw;
    this.camera.bottom = -this.vh;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** The studio the metal reflects. */
  light() {
    if (!this.scene.environment) this.scene.environment = studio(this.renderer);
  }

  /** Compiles the shaders before they are first needed. */
  async warm() {
    this.moon.update(this.moonState, scrollY);
    // compile everything, including what is hidden for now (the night glow, the ribbon, the covers),
    // so nothing stalls the first time it appears
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    await this.renderer.compileAsync(this.scene, this.camera);
    hidden.forEach((o) => (o.visible = false));
    this.dirty = true;
  }

  invalidate() { this.dirty = true; }

  frame(dt: number) {
    this.time += dt;
    if (this.dprCap > 1.25 && this.time > 3) {
      this.slow = dt > 0.021 ? this.slow + 1 : Math.max(0, this.slow - 0.5);
      if (++this.settled > 90 && this.slow > 30) {
        this.dprCap = this.dprCap > 1.6 ? 1.5 : 1.25;
        this.slow = 0; this.settled = 0;
        this.resize();
      }
    }
    const y = scrollY;
    const v = dt > 0 ? (y - (this.lastY < 0 ? y : this.lastY)) / dt : 0;
    this.velocity += (Math.max(-6000, Math.min(6000, v)) - this.velocity) * (1 - Math.exp(-10 * dt));
    for (const h of this.hooks) h(this.time, dt);

    let changed = this.dirty || y !== this.lastY;
    this.lastY = y;
    this.camera.position.y = -y;
    if (this.moon.update(this.moonState, y)) changed = true;
    const s = this.moonState;
    const light = `${s.light.x.toFixed(3)},${s.light.y.toFixed(3)}`;
    if (light !== this.lastLight) {
      this.lastLight = light;
      // the light follows the pointer a little: the studio turns, not the objects
      this.scene.environmentRotation.set(-s.light.y * 0.35, s.light.x * 0.6, 0);
      changed = true;
    }
    this.ribbon.tick(this.time);
    if (this.ribbon.ringing(this.time)) changed = true;
    if (this.cards.update(this.time, dt, this.velocity, y, this.vh)) changed = true;
    if (!changed) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }
}
