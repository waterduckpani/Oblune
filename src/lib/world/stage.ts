import { World } from './World';
import type { RibbonPoint } from './Ribbon';
import { sound } from '../audio';

/**
 * The stage is made once per visit, by whichever page needs it first, and every page after that
 * reuses it (shaders never recompile). Without WebGL the page shows its stills instead.
 */
let world: World | null = null;
let failed = false;
export function getWorld() {
  if (world || failed) return world;
  try {
    world = new World(document.querySelector<HTMLCanvasElement>('[data-world]')!);
    Object.assign((window as unknown as { __oblune: object }).__oblune ?? {}, { world });
  } catch (err) {
    console.warn('WebGL unavailable, showing stills instead', err);
    failed = true;
    document.documentElement.classList.add('no-webgl');
  }
  return world;
}

/** Hands the main thread back between steps, so a start-up never blocks input for long. */
const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Builds the stage ahead of a page's mount, a step per task (renderer, then the studio light), so no
 * single task is long. A page that asks with `getWorld()` before this has run gets it built at once.
 */
export async function prepareWorld() {
  if (world || failed) return;
  try {
    const w = new World(document.querySelector<HTMLCanvasElement>('[data-world]')!, true);
    await yieldTask();
    w.light();
    await yieldTask();
    if (!world) {
      world = w;
      Object.assign((window as unknown as { __oblune: object }).__oblune ?? {}, { world });
    }
  } catch (err) {
    console.warn('WebGL unavailable, showing stills instead', err);
    failed = true;
    document.documentElement.classList.add('no-webgl');
  }
}

// ---------- Measuring the page, for routes ----------
export type Box = { l: number; t: number; w: number; h: number; r: number; b: number; cx: number; cy: number };
const box = (r: DOMRect): Box => ({ l: r.left, t: r.top + scrollY, w: r.width, h: r.height, r: r.right, b: r.bottom + scrollY, cx: r.left + r.width / 2, cy: r.top + scrollY + r.height / 2 });
/** An element's box in page px. */
export const pageBox = (el: Element) => box(el.getBoundingClientRect());
/** The box the text itself fills (not its element), in page px. */
export function textBox(el: Element) {
  const rg = document.createRange();
  rg.selectNodeContents(el);
  return box(rg.getBoundingClientRect());
}
/** Points round an ellipse, tilted by `rot`, from angle a0 for `turns`; depth swings front to back. */
export function ellipse(out: RibbonPoint[], cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, turns: number, depth: number, steps: number) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (i / steps) * Math.PI * 2 * turns;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot), z: Math.sin(a) * depth });
  }
}

/**
 * Drives the ribbon on a page: lays it along a route, decides when each part of it is drawn (as it
 * comes up the screen, never faster than `pace` px of scroll per px of ribbon, the first screen's part
 * at once, and always whole by the bottom of the page), springs its head after the scroll, and lets
 * the pointer pluck it.
 */
export class RibbonDriver {
  private reveal: number[] = [];
  private tailReveal: number[] = [];
  private drawn = -1;
  private tailDrawn = -1;
  private prevP = { x: -1, y: -1 };
  private pluckAt = 0;
  /** 0..1: how much of the head's target is drawn (the intro draws it on). */
  intro = { v: 1 };

  /**
   * `headAt`: how far down the screen the head runs (0..1). `comet`: if set, the ribbon is a travelling
   * segment whose tail is kept this far down the screen, so it moves with you instead of piling up.
   */
  constructor(private w: World, private opts: { pace?: number; headAt?: number; comet?: number; coarse: boolean; reduced: boolean }) {}

  build(route: RibbonPoint[]) {
    const r = this.w.ribbon;
    r.setRoute(route);
    const vh = innerHeight, pace = this.opts.pace ?? 0.34;
    const reveal = new Array<number>(r.pts.length);
    let prev = -Infinity, first = true;
    for (let i = 0; i < r.pts.length; i++) {
      if (first && r.pts[i].y > vh * 0.98) first = false;
      if (first) { reveal[i] = prev = -1; continue; }
      const due = r.pts[i].y - vh * (this.opts.headAt ?? 0.74);
      prev = Math.max(due, prev + (r.lens[i] - r.lens[i - 1]) * pace);
      reveal[i] = prev;
    }
    // whole by the bottom of the page: squeeze the last stretch if the pace would leave it short
    const maxS = document.documentElement.scrollHeight - vh - 4;
    const last = reveal.length - 1;
    if (last > 0 && reveal[last] > maxS) {
      let k = reveal.findIndex((v) => v > maxS - vh * 1.4);
      if (k < 1) k = 1;
      const a = reveal[k - 1], span = reveal[last] - a;
      for (let i = k; i <= last; i++) reveal[i] = a + ((reveal[i] - a) * (maxS - a)) / span;
    }
    this.reveal = reveal;
    this.drawn = -1;
    // a comet's tail: each part leaves once it has risen past the tail's line on the screen
    if (this.opts.comet !== undefined) {
      let m = -Infinity;
      this.tailReveal = r.pts.map((q) => (m = Math.max(m, q.y - vh * this.opts.comet!)));
      this.tailDrawn = -1;
    }
  }
  private tailFor(y: number) {
    const rv = this.tailReveal;
    if (!rv.length || rv[0] > y) return 0;
    let lo = 0, hi = rv.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rv[m] <= y) lo = m; else hi = m - 1; }
    return this.w.ribbon.lens[lo];
  }

  private headFor(y: number) {
    const rv = this.reveal;
    if (!rv.length || rv[0] > y) return 0;
    let lo = 0, hi = rv.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rv[m] <= y) lo = m; else hi = m - 1; }
    return this.w.ribbon.lens[lo];
  }

  frame(t: number, dt: number) {
    const r = this.w.ribbon, vh = innerHeight;
    // the head follows the scroll on a short spring with a top speed; a jump across the page snaps
    const want = this.headFor(scrollY) * this.intro.v;
    const gap = want - this.drawn;
    if (this.drawn < 0 || Math.abs(gap) > vh * 4) this.drawn = want;
    else this.drawn += Math.sign(gap) * Math.min(Math.abs(gap) * (1 - Math.exp(-12 * dt)), Math.max(2600, Math.abs(gap) * 1.4) * dt);
    if (Math.abs(this.drawn - r.head) > 0.3) { r.setHead(this.drawn); this.w.invalidate(); }
    if (this.opts.comet !== undefined) {
      // the tail follows the same way, and always leaves a little of the ribbon behind the head
      const tw = Math.min(this.tailFor(scrollY), Math.max(0, this.drawn - 420));
      const tg = tw - this.tailDrawn;
      if (this.tailDrawn < 0 || Math.abs(tg) > vh * 4) this.tailDrawn = tw;
      else this.tailDrawn += Math.sign(tg) * Math.min(Math.abs(tg) * (1 - Math.exp(-12 * dt)), Math.max(2600, Math.abs(tg) * 1.4) * dt);
      r.setTail(this.tailDrawn);
    }
    this.strum(t);
  }

  /** The pointer plucks the ribbon where its path crosses it. */
  private strum(t: number) {
    if (this.opts.coarse || this.opts.reduced) return;
    const p = this.w.pointer, S = scrollY, prevP = this.prevP;
    const ax = prevP.x, ay = prevP.y + S, bx = p.px, by = p.py + S;
    const moved = prevP.x >= 0 && (prevP.x !== p.px || prevP.y !== p.py);
    prevP.x = p.px; prevP.y = p.py;
    if (!moved || p.px < 0 || t - this.pluckAt < 0.12) return;
    const r = this.w.ribbon;
    const lo = Math.min(ay, by) - 30, hi = Math.max(ay, by) + 30;
    for (let i = 1; i < r.pts.length; i++) {
      if (r.lens[i] > r.head) break;
      if (r.lens[i] < r.tail) continue;
      const q = r.pts[i], o = r.pts[i - 1];
      if (Math.max(q.y, o.y) < lo || Math.min(q.y, o.y) > hi) continue;
      const d1 = (bx - ax) * (o.y - ay) - (by - ay) * (o.x - ax);
      const d2 = (bx - ax) * (q.y - ay) - (by - ay) * (q.x - ax);
      const d3 = (q.x - o.x) * (ay - o.y) - (q.y - o.y) * (ax - o.x);
      const d4 = (q.x - o.x) * (by - o.y) - (q.y - o.y) * (bx - o.x);
      if (d1 * d2 < 0 && d3 * d4 < 0) {
        const speed = Math.hypot(bx - ax, by - ay);
        r.pluck(r.lens[i], Math.min(26, 6 + speed * 0.5), d3 > 0 ? -1 : 1, t);
        sound.pluck(Math.floor(r.lens[i] / 420) % 8, Math.min(1, 0.35 + speed / 50));
        this.pluckAt = t;
        return;
      }
    }
  }
}
