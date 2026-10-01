import * as THREE from 'three';
import { Device, SPECS } from './devices';
import { acquire, release } from './textures';
import { Terminal } from './terminal';
import type { World } from './World';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

const TEX = '/work/tex';
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Mode = 'push' | 'rise' | 'fade';
/** What a screen shows: a texture, how it arrives, and for tall captures, how far it is scrolled (0 top, 1 bottom). */
type Screen = { tex: string; mode?: Mode; scroll?: number };
type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; bright: number; s: number };
type Target = Partial<Pose> & { screen?: Screen };
/** step, seconds since the step began, stage width and height, clock */
type Ctx = { step: number; t: number; W: number; H: number; time: number };

type Def = {
  textures: string[];
  devices: ('phone' | 'plate')[];
  /** Each device's size: phones by height, plates by width, in stage px. */
  size: (W: number, H: number) => number[];
  pose: (c: Ctx) => Target[];
  tick?: (stage: ChapterStage, c: Ctx, dt: number) => void;
};

let shadowTex: THREE.CanvasTexture | null = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.filter = 'blur(24px)';
  g.fillStyle = 'rgba(0,0,0,1)';
  g.beginPath();
  g.roundRect(60, 60, 136, 136, 26);
  g.fill();
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** A critically damped spring per pose channel: fast, never overshooting, and calm under quick step changes. */
class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, dt: number, w = 6.5) {
    if (reduced) { this.x = target; this.v = 0; return this.x; }
    const f = -2 * w * this.v - w * w * (this.x - target);
    this.v += f * dt;
    this.x += this.v * dt;
    return this.x;
  }
}
const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'bright', 's'] as const;
const ONE = new Set(['bright', 's']);

type ScreenState = { cur: Screen | null; next: Screen | null; mix: number };

/** One project's 3D stage. It follows its DOM panel and poses its devices for the active step. */
export class ChapterStage {
  scene = new THREE.Scene();
  root = new THREE.Group();
  devices: Device[] = [];
  shadows: THREE.Mesh[] = [];
  springs: Record<(typeof KEYS)[number], Spring>[] = [];
  screens: ScreenState[] = [];
  tex = new Map<string, THREE.Texture>();
  urls: string[] = [];
  loaded = false;
  terminal: Terminal | null = null;
  step = 0;
  stepAt = 0;
  active = false;
  /** the stage panel on screen, in CSS px, for clipping */
  clip = { x: 0, y: 0, w: 0, h: 0 };
  private tilt = { x: 0, y: 0 };
  private def: Def;
  private panel: HTMLElement;
  private right = false;
  private slot: HTMLElement;

  constructor(public world: World, public section: HTMLElement, public slug: string) {
    this.def = DEFS[slug];
    this.scene.environment = world.scene.environment;
    this.scene.add(this.root);
    this.panel = section.querySelector<HTMLElement>('[data-stage-panel]')!;
    this.slot = section.querySelector<HTMLElement>('[data-stage]')!;
    this.right = section.classList.contains('chapter--right');
    // the half-size screens: a device on the stage is never drawn wider than about 1400 device px,
    // and a quarter of the pixels is a quarter of the upload, which is what made fast scrolls stutter
    this.urls = this.def.textures.map((n) => `${TEX}/${slug}/${n}-s.webp`);
    this.def.devices.forEach((kind) => {
      const d = new Device(kind);
      this.devices.push(d);
      this.root.add(d.group);
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x0c0d10, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      sh.renderOrder = -1;
      this.shadows.push(sh);
      this.root.add(sh);
      this.springs.push(Object.fromEntries(KEYS.map((k) => [k, new Spring(ONE.has(k) ? 1 : 0)])) as ChapterStage['springs'][number]);
      this.screens.push({ cur: null, next: null, mix: 0 });
    });
    if (slug === 'alfard') this.terminal = new Terminal();
    this.root.visible = false;
  }

  /** The same project, on a freshly mounted page. */
  bind(section: HTMLElement) {
    this.section = section;
    this.panel = section.querySelector<HTMLElement>('[data-stage-panel]')!;
    this.slot = section.querySelector<HTMLElement>('[data-stage]')!;
    this.right = section.classList.contains('chapter--right');
    this.step = 0;
    this.stepAt = this.world.time;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    this.urls.forEach((u, i) => acquire(u, this.world.renderer).promise.then((t) => { if (this.loaded) this.tex.set(this.def.textures[i], t); }).catch(() => {}));
  }

  unload() {
    if (!this.loaded) return;
    this.urls.forEach(release);
    this.tex.clear();
    this.loaded = false;
  }

  setStep(step: number) {
    if (step === this.step) return;
    this.step = step;
    this.stepAt = this.world.time;
  }

  /** Returns true when the stage is on screen and should be drawn. */
  update(time: number, dt: number, pointer: { x: number; y: number }) {
    const vh = this.world.vh;
    const r = this.section.getBoundingClientRect();
    if (r.bottom > -vh * 1.5 && r.top < vh * 2.5) this.load();
    else if (r.bottom < -vh * 4 || r.top > vh * 5) this.unload();
    const pr = this.panel.getBoundingClientRect();
    this.active = pr.bottom > 0 && pr.top < vh;
    this.root.visible = this.active;
    if (!this.active) return false;
    // devices may roam the stage's whole column, from the gutter to the edge of the screen,
    // but never past their own chapter's body, so they can never reach a title or the copy
    const vw = this.world.vw;
    const wr = this.panel.parentElement!.getBoundingClientRect();
    const top = Math.max(0, wr.top - 30), bottom = Math.min(vh, wr.bottom + 30);
    if (vw <= 860) this.clip = { x: 0, y: top, w: vw, h: Math.max(0, Math.min(bottom, pr.bottom + 8) - top) };
    else if (this.right) this.clip = { x: 0, y: top, w: wr.right + 12, h: Math.max(0, bottom - top) };
    else this.clip = { x: wr.left - 12, y: top, w: vw - wr.left + 12, h: Math.max(0, bottom - top) };

    const sr = this.slot.getBoundingClientRect();
    const W = sr.width, H = sr.height;
    // the panel rises into view; the devices settle a beat later, like objects placed on a table
    const e = reduced ? 1 : easeOut(clamp((vh - pr.top) / (vh * 0.9)));
    this.root.position.set(sr.left + W / 2 - this.world.vw / 2, -(sr.top + H / 2 - vh / 2) - (1 - e) * H * 0.28, 0);
    this.tilt.x += (pointer.x * 0.07 - this.tilt.x) * (1 - Math.exp(-3 * dt));
    this.tilt.y += (pointer.y * 0.045 - this.tilt.y) * (1 - Math.exp(-3 * dt));
    this.root.rotation.set(this.tilt.y + (1 - e) * 0.32, this.tilt.x, 0);

    const ctx: Ctx = { step: this.step, t: time - this.stepAt, W, H, time };
    const sizes = this.def.size(W, H);
    this.devices.forEach((d, i) => d.group.scale.setScalar(d.kind === 'phone' ? sizes[i] / d.height : sizes[i] / (1 + (SPECS.plate.bezel + SPECS.plate.rim) * 2)));
    this.def.tick?.(this, ctx, dt);
    const targets = this.def.pose(ctx);
    this.devices.forEach((d, i) => {
      const tg = targets[i] ?? {};
      const sp = this.springs[i];
      const p = {} as Pose;
      for (const k of KEYS) p[k] = sp[k].step((tg[k] as number | undefined) ?? (ONE.has(k) ? 1 : 0), dt, k === 'bright' ? 5 : 6.5);
      d.group.scale.multiplyScalar(Math.max(0.0001, p.s));
      d.group.visible = p.s > 0.01;
      this.shadows[i].visible = p.s > 0.01;
      this.place(d, i, p, W, H);
      if (tg.screen) this.show(i, tg.screen, dt);
      else this.show(i, this.screens[i].next ?? this.screens[i].cur, dt);
    });
    return true;
  }

  private show(i: number, want: Screen | null, dt: number) {
    const s = this.screens[i];
    const d = this.devices[i];
    if (want && (!s.cur || (s.cur.tex !== want.tex && s.next?.tex !== want.tex))) {
      if (!s.cur || reduced) { s.cur = want; s.next = null; s.mix = 0; }
      else { if (s.next) s.cur = s.next; s.next = want; s.mix = 0; }
    }
    // keep scroll offsets live without restarting a transition
    if (want && s.cur && s.cur.tex === want.tex) s.cur = want;
    if (want && s.next && s.next.tex === want.tex) s.next = want;
    if (s.next) {
      // wait for the incoming texture, then play the transition
      if (this.tex.has(s.next.tex)) s.mix = Math.min(1, s.mix + dt / 0.85);
      if (s.mix >= 1) { s.cur = s.next; s.next = null; s.mix = 0; }
    }
    const a = s.cur ? this.tex.get(s.cur.tex) ?? null : null;
    const b = s.next ? this.tex.get(s.next.tex) ?? null : null;
    this.fit(d, 'A', a, s.cur);
    this.fit(d, 'B', b, s.next);
    if (this.terminal && d.kind === 'plate') { d.set(this.terminal.texture, null, 0); return; }
    d.set(a, b, b ? s.mix : 0, s.next?.mode ?? 'push');
  }

  /** A tall capture shows a window of itself, scrolled; everything else fills the screen. */
  private fit(d: Device, which: 'A' | 'B', t: THREE.Texture | null, s: Screen | null) {
    if (!t || !s) { d.xform(which, 1, 1, 0, 0); return; }
    const img = t.image as { width: number; height: number };
    const aspect = d.kind === 'phone' ? SPECS.phone.sh : SPECS.plate.sh;
    const vis = Math.min(1, (img.width * aspect) / img.height);
    if (vis >= 0.999) { d.xform(which, 1, 1, 0, 0); return; }
    d.xform(which, 1, vis, 0, (1 - vis) * (1 - (s.scroll ?? 0)));
  }

  private place(d: Device, i: number, p: Pose, W: number, H: number) {
    d.group.position.set(p.x, p.y, p.z);
    d.group.rotation.set(p.rx, p.ry, p.rz);
    d.screen.uniforms.uBright.value = p.bright;
    d.screen.uniforms.uSheen.value = 0.45 + p.ry * 0.9 + this.tilt.x * 2.2;
    const sh = this.shadows[i];
    const sc = d.group.scale.x;
    const w = sc * (d.kind === 'phone' ? 1.18 : 1.08) * (0.3 + 0.7 * Math.abs(Math.cos(p.ry)));
    const h = sc * d.height * 1.04;
    sh.scale.set(w * 1.3, h * 1.22, 1);
    sh.position.set(p.x + W * 0.018 + p.z * 0.06, p.y - H * 0.03 - p.z * 0.05, p.z - 160);
    sh.rotation.z = p.rz;
    (sh.material as THREE.MeshBasicMaterial).opacity = 0.24 * clamp(1 - Math.abs(p.rx) * 0.8) * clamp(p.bright * 1.4 - 0.2);
  }
}

// ---------------------------------------------------------------------------------------------
// The choreographies. Each is a set of poses per step, so every move has a reason and an end.
// ---------------------------------------------------------------------------------------------

export const DEFS: Record<string, Def> = {
  // A browser and a phone walk through one lesson. Step one types a ticker into the dashboard.
  stocky: {
    textures: ['d_dash', 'd_search', 'd_chart', 'd_concept', 'd_game', 'd_quiz', 'm_dash', 'm_chart', 'm_concept', 'm_quiz'],
    devices: ['plate', 'phone'],
    size: (W, H) => [Math.min(W * 0.84, H * 1.18), H * 0.6],
    pose: ({ step, t, W, H }) => {
      const plate: Screen[] = [
        t > 1.4 || step > 0 ? { tex: 'd_search', mode: 'fade' } : { tex: 'd_dash' },
        { tex: 'd_chart' },
        { tex: 'd_concept' },
        t > 1.8 ? { tex: 'd_quiz' } : { tex: 'd_game' },
      ];
      const phone = ['m_dash', 'm_chart', 'm_concept', 'm_quiz'];
      const turn = [-0.16, -0.08, -0.14, -0.06][step] ?? 0;
      return [
        { x: -W * 0.07, y: H * 0.05, z: 0, rx: -0.03, ry: turn, screen: step === 0 && t <= 1.4 ? plate[0] : plate[step] },
        { x: W * 0.35, y: -H * 0.16, z: 150, rx: 0.02, ry: -0.24 - turn * 0.5, rz: 0.015, screen: { tex: phone[step] ?? phone[0] } },
      ];
    },
  },

  // Three phones turn like a carousel: the step in focus comes forward, the others wait either side.
  haqdar: {
    textures: ['record', 'verify', 'matches', 'why'],
    devices: ['phone', 'phone', 'phone'],
    size: (W, H) => { const h = Math.min(H * 0.86, W * 0.62); return [h, h, h]; },
    pose: ({ step, W, H }) => {
      const screens = ['record', 'verify', 'matches', 'why'];
      const spread = Math.min(W * 0.3, H * 0.42);
      return [0, 1, 2].map((p) => {
        // which slot this phone is in: 0 centre, 1 right (next), 2 left (previous)
        const slot = ((p - step) % 3 + 3) % 3;
        const side = slot === 0 ? 0 : slot === 1 ? 1 : -1;
        const shows = screens[(step + side + screens.length) % screens.length];
        return {
          x: side * spread, y: side ? -H * 0.02 : 0, z: side ? -120 : 90,
          rx: 0, ry: -side * 0.42, rz: side * 0.02,
          bright: side ? 0.55 : 1,
          screen: { tex: shows, mode: side ? 'fade' : 'push' },
        } as Target;
      });
    },
  },

  // A deck, swiped the way Bite reads: right to read, left to skip, down to save.
  bite: {
    textures: ['swipe', 'feed', 'follow', 'algorithm'],
    devices: ['phone', 'phone', 'phone', 'phone'],
    size: (W, H) => { const h = Math.min(H * 0.86, W * 0.66); return [h, h, h, h]; },
    pose: ({ step, t, W, H, time }) => {
      const cards = ['swipe', 'feed', 'follow', 'algorithm'];
      const jitter = [0, 0.035, -0.03, 0.028];
      const away: Target[] = [
        { x: W * 0.95, y: H * 0.06, rz: -0.38, ry: 0.35, bright: 1 },
        { x: -W * 0.3, y: H * 0.1, z: -260, rz: 0.5, ry: -0.6, s: 0.02, bright: 0.2 },
        { x: 0, y: -H * 1.25, rx: 0.5, z: 60, bright: 1 },
      ];
      return cards.map((tex, i) => {
        if (i < step) return { ...away[i], screen: { tex } };
        const depth = i - step;
        // the top card leans, once, toward the gesture it is about to take
        const lean = depth === 0 && i < 3 && !reduced ? Math.sin(Math.min(1, Math.max(0, t - 0.5) / 0.9) * Math.PI) * 0.6 : 0;
        const dir = [1, -1, 0][i] ?? 0;
        return {
          x: depth * W * 0.05 + dir * lean * W * 0.05,
          y: depth * H * 0.012 - (i === 2 ? lean * H * 0.04 : 0) + (depth === 0 ? Math.sin(time * 1.1) * H * 0.004 : 0),
          z: -depth * 90,
          rx: -0.02, ry: -0.1 - depth * 0.06 + dir * lean * 0.05,
          rz: jitter[i] * 1.6 * Math.min(1, depth) - dir * lean * 0.05,
          bright: 1 - Math.min(0.4, depth * 0.16),
          screen: { tex },
        };
      });
    },
  },

  // Two ledgers slide in and net off into one number; a claim and a monthly bill arrive as sheets;
  // then the launch site, mullapp.in, takes the stage
  mull: {
    textures: ['goa', 'home', 'owes', 'claim', 'recurring_due', 'site_hero', 'site_number', 'site_pay', 'site_rent', 'site_m'],
    devices: ['phone', 'phone', 'phone', 'plate'],
    size: (W, H) => { const h = Math.min(H * 0.86, W * 0.62); return [h, h * 0.94, h * 0.94, Math.min(W * 0.9, H * 1.24)]; },
    pose: ({ step, t, W, H }) => {
      const far = Math.min(W * 0.4, H * 0.6), near = Math.min(W * 0.27, H * 0.38);
      const nn = step === 0 ? smooth(0.2, 1.4, t) : 1;
      const d = lerp(far, near, nn);
      if (step >= 3) {
        const pages = ['site_hero', 'site_number', 'site_pay', 'site_rent'];
        const page = reduced ? 0 : Math.floor(t / 2.6) % pages.length;
        return [
          { x: W * 0.34, y: -H * 0.2, z: 170, ry: -0.22, s: 0.62, screen: { tex: 'site_m', mode: 'fade' } },
          { x: -d * 0.6, y: -H * 0.2, z: -300, ry: 0.4, s: 0.01, bright: 0.3, screen: { tex: 'goa' } },
          { x: d * 0.6, y: -H * 0.2, z: -300, ry: -0.4, s: 0.01, bright: 0.3, screen: { tex: 'owes' } },
          { x: -W * 0.04, y: H * 0.06, z: 20, rx: -0.03, ry: 0.1, s: 1, screen: { tex: pages[page], mode: 'fade' } },
        ];
      }
      const centre: Screen = step === 0 ? { tex: 'home' } : step === 1 ? { tex: 'claim', mode: 'rise' } : { tex: 'recurring_due', mode: 'rise' };
      const side = step === 0 ? 1 : 0.6;
      return [
        { x: 0, y: 0, z: 100, ry: 0, screen: centre },
        { x: -d, y: -H * 0.02, z: -110, ry: 0.4, bright: side, screen: { tex: 'goa' } },
        { x: d, y: -H * 0.02, z: -110, ry: -0.4, bright: side, screen: { tex: 'owes' } },
        { x: 0, y: -H * 0.3, z: -500, rx: 0.3, s: 0.01, bright: 0, screen: { tex: 'site_hero' } },
      ];
    },
  },

  // The desktop edition scrolls itself, a story opens on both, then back to the sign-up.
  article: {
    textures: ['d_home_tall', 'd_story', 'm_home', 'm_story', 'm_story2'],
    devices: ['plate', 'phone'],
    size: (W, H) => [Math.min(W * 0.84, H * 1.18), H * 0.6],
    pose: ({ step, t, W, H }) => {
      const drift = reduced ? 1 : easeOut(clamp((t - 0.4) / 5));
      const plate: Screen =
        step === 0 ? { tex: 'd_home_tall', scroll: lerp(0, 0.2, drift) }
          : step === 1 ? { tex: 'd_story' }
          : { tex: 'd_home_tall', scroll: 0.97 };
      const phone = ['m_home', 'm_story', 'm_story2'][step] ?? 'm_home';
      const turn = [0.14, 0.07, 0.12][step] ?? 0;
      return [
        { x: W * 0.07, y: H * 0.05, rx: -0.03, ry: turn, screen: plate },
        { x: -W * 0.35, y: -H * 0.16, z: 150, rx: 0.02, ry: 0.24 - turn * 0.5, rz: -0.015, screen: { tex: phone, mode: step === 2 ? 'rise' : 'push' } },
      ];
    },
  },

  // Today's briefing, then a country clicked on the globe; the stories with their numbers, a
  // thread and the glossary, with the phone reading the same page each time.
  'power-policy': {
    textures: ['d_home', 'd_globe', 'd_stories', 'd_thread', 'd_glossary', 'm_home', 'm_stories', 'm_thread', 'm_glossary'],
    devices: ['plate', 'phone'],
    size: (W, H) => [Math.min(W * 0.84, H * 1.18), H * 0.6],
    pose: ({ step, t, W, H }) => {
      const plate: Screen =
        step === 0 ? (t > 2.2 && !reduced ? { tex: 'd_globe', mode: 'fade' } : { tex: 'd_home' })
          : { tex: ['d_home', 'd_stories', 'd_thread', 'd_glossary'][step] ?? 'd_home', mode: 'push' };
      const phone = ['m_home', 'm_stories', 'm_thread', 'm_glossary'][step] ?? 'm_home';
      const turn = [-0.13, -0.06, -0.11, -0.05][step] ?? 0;
      return [
        { x: -W * 0.07, y: H * 0.05, z: 0, rx: -0.03, ry: turn, screen: plate },
        { x: W * 0.35, y: -H * 0.16, z: 150, rx: 0.02, ry: -0.24 - turn * 0.5, rz: 0.015, screen: { tex: phone, mode: step === 2 ? 'rise' : 'push' } },
      ];
    },
  },

  // The storefront scrolls itself, a collection, a product that hands off to the cart, then down
  // the home page to the reviews, with the phone showing the same moment each time.
  'viraj-mahajan': {
    textures: ['d_home_tall', 'd_col', 'd_product', 'd_cart', 'm_home', 'm_col', 'm_product', 'm_cart', 'm_waist'],
    devices: ['plate', 'phone'],
    size: (W, H) => [Math.min(W * 0.84, H * 1.18), H * 0.6],
    pose: ({ step, t, W, H }) => {
      const drift = reduced ? 0.3 : easeOut(clamp((t - 0.3) / 6));
      const plate: Screen =
        step === 0 ? { tex: 'd_home_tall', scroll: lerp(0, 0.34, drift) }
          : step === 1 ? { tex: 'd_col', mode: 'push' }
          : step === 2 ? (t > 2 && !reduced ? { tex: 'd_cart', mode: 'fade' } : { tex: 'd_product' })
          : { tex: 'd_home_tall', scroll: lerp(0.74, 1, drift), mode: 'fade' };
      const phone: Screen =
        step === 0 ? { tex: 'm_home' }
          : step === 1 ? { tex: 'm_col' }
          : step === 2 ? (t > 2.4 && !reduced ? { tex: 'm_cart', mode: 'rise' } : { tex: 'm_product' })
          : { tex: 'm_waist' };
      const turn = [-0.14, -0.07, -0.12, -0.05][step] ?? 0;
      return [
        { x: -W * 0.07, y: H * 0.05, z: 0, rx: -0.03, ry: turn, screen: plate },
        { x: W * 0.35, y: -H * 0.16, z: 150, rx: 0.02, ry: -0.24 - turn * 0.5, rz: 0.015, screen: phone },
      ];
    },
  },

  // The terminal types the session at a human pace and waits at the approval gate.
  alfard: {
    textures: [],
    devices: ['plate'],
    size: (W, H) => [Math.min(W * 0.92, H * 1.3)],
    tick: (stage, { step }, dt) => {
      const term = stage.terminal!;
      const goal = [term.marks.request, term.marks.gate, 1][step] ?? 0;
      term.typed = reduced ? goal : term.typed < goal ? Math.min(goal, term.typed + dt * (step === 0 ? 0.16 : 0.22)) : goal;
      term.update(term.typed, stage.world.time);
    },
    pose: ({ step, time, W }) => {
      const gate = step === 1;
      return [{ x: 0, y: 0, z: gate ? 70 : 0, rx: -0.03, ry: [0.16, 0.02, -0.1][step] ?? 0, bright: 1 }].map((p) => ({ ...p, y: p.y + Math.sin(time * 0.8) * W * 0.002 }));
    },
  },
};
