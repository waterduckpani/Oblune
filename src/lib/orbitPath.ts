import type { Pt } from './world/line';

/**
 * The orbit: one line down the page, built from the layout itself.
 *
 * On a wide screen it wanders. It leaves the index moon in a long swing across the page, loops
 * in the open space above each kind of work, runs along that category's rule as if drawing it,
 * drops to each chapter's moon and loops it, runs through the chapter's steps, then swings out
 * across the gap to the next one, sometimes with a loop in the middle. On a phone it keeps to
 * the gutter, so it never crosses the copy.
 *
 * Every point is in document px. `reach` maps each sample to the scroll at which the head arrives:
 * usually when the point is level with HEAD, but long sideways runs are given scroll of their own
 * (so they draw as you go, rather than all at once), and it never runs backwards.
 */
export type OrbitPath = {
  pts: Pt[];
  lens: number[];
  reach: number[];
  total: number;
  /** Arc length at each chapter's glyph, and at each step dot, in page order. */
  nodes: { el: Element; len: number }[];
  steps: { el: Element; len: number }[];
  /** Where the footer orbit starts, and the footer moon's centre and radius. */
  finale: { len: number; c: Pt; r: number };
  start: Pt;
};

export const HEAD = 0.6;
const LOOP = 20;
/** Scroll px given to each px of sideways travel. */
const PACE = 0.36;

const docRect = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 + scrollY, w: r.width, h: r.height, top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right };
};

class Builder {
  pts: Pt[] = [];
  marks = new Map<string, number>();
  step = 5;
  get last() { return this.pts[this.pts.length - 1]; }
  move(p: Pt) { this.pts.push({ ...p }); }
  mark(label: string) { this.marks.set(label, this.pts.length - 1); }
  lineTo(p: Pt) {
    const a = this.last;
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 24));
    for (let i = 1; i <= n; i++) this.pts.push({ x: a.x + ((p.x - a.x) * i) / n, y: a.y + ((p.y - a.y) * i) / n });
  }
  curveTo(c1: Pt, c2: Pt, p: Pt) {
    const a = this.last;
    const est = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p.x - c2.x, p.y - c2.y);
    const n = Math.max(8, Math.ceil(est / this.step));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.pts.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p.y,
      });
    }
  }
  /** An S-bend from the current point to p, leaving and arriving vertically. */
  bendTo(p: Pt) {
    const a = this.last;
    const k = Math.max(40, (p.y - a.y) * 0.55);
    this.curveTo({ x: a.x, y: a.y + k }, { x: p.x, y: p.y - k }, p);
  }
  /** Carries on from the current heading and arrives at p travelling down. */
  flowTo(p: Pt) {
    const a = this.last, q = this.pts[this.pts.length - 2] ?? { x: a.x, y: a.y - 1 };
    const tl = Math.hypot(a.x - q.x, a.y - q.y) || 1;
    const tx = (a.x - q.x) / tl, ty = (a.y - q.y) / tl;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    const k1 = Math.max(60, d * 0.42);
    this.curveTo({ x: a.x + tx * k1, y: a.y + ty * k1 }, { x: p.x, y: p.y - Math.max(40, (p.y - a.y) * 0.5) }, p);
  }
  /** A bend that leaves heading down and arrives travelling sideways (dir 1 = rightwards). */
  bendAcross(p: Pt, dir: number) {
    const a = this.last;
    const dy = Math.max(30, p.y - a.y);
    this.curveTo({ x: a.x, y: a.y + dy * 0.7 }, { x: p.x - dir * Math.max(80, Math.abs(p.x - a.x) * 0.5), y: p.y }, p);
  }
  /** A full loop that enters and leaves at the circle's left point, travelling down. */
  loop(c: Pt, r: number, turns = 1, ry = 1) {
    const n = Math.max(24, Math.ceil((Math.PI * 2 * r * turns) / this.step));
    for (let i = 1; i <= n; i++) {
      const th = Math.PI - (i / n) * Math.PI * 2 * turns;
      this.pts.push({ x: c.x + Math.cos(th) * r, y: c.y + Math.sin(th) * r * ry });
    }
  }
  /**
   * A loop-the-loop while travelling sideways: the line rises into a circle and carries on in the
   * same direction, like a pen flourish. dir 1 travels right, -1 left.
   */
  flourish(r: number, dir: number) {
    const a = this.last;
    const c = { x: a.x, y: a.y - r };
    const n = Math.max(28, Math.ceil((Math.PI * 2 * r) / this.step));
    for (let i = 1; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      // start at the bottom of the circle moving in `dir`, go round once, drifting on a little
      this.pts.push({ x: c.x + Math.sin(th) * r * dir + (i / n) * r * 0.9 * dir, y: c.y + Math.cos(th) * r });
    }
  }
}

export function buildOrbit(opts: { vh: number; mobile: boolean }): OrbitPath | null {
  const { vh, mobile } = opts;
  const vw = document.documentElement.clientWidth;
  const index = document.querySelector<HTMLElement>('[data-index]');
  const indexMoon = document.querySelector<HTMLElement>('[data-moon-anchor="index"]');
  const frame = index?.querySelector<HTMLElement>('.index__frame');
  const footerMoon = document.querySelector<HTMLElement>('[data-moon-anchor="footer"]');
  if (!index || !indexMoon || !frame || !footerMoon) return null;

  // the edges of the content column, and the middle of each gutter
  const probe = document.querySelector('.work .container') ?? document.querySelector('.container');
  const cs = probe ? getComputedStyle(probe) : null;
  const pr = probe?.getBoundingClientRect();
  const left = pr && cs ? pr.left + parseFloat(cs.paddingLeft) : 24;
  const right = pr && cs ? pr.right - parseFloat(cs.paddingRight) : vw - 24;
  const gutter = pr && cs ? parseFloat(cs.paddingLeft) : 24;

  // where the index moon sits once its section has finished pinning
  const ir = index.getBoundingClientRect(), fr = frame.getBoundingClientRect(), mr = indexMoon.getBoundingClientRect();
  const pinEnd = ir.bottom + scrollY - fr.height;
  const start = { x: mr.left + mr.width / 2, y: pinEnd + (mr.top - fr.top) + mr.height / 2 };

  const b = new Builder();
  b.move(start);
  const nodes: { el: Element; label: string }[] = [];
  const steps: { el: Element; label: string }[] = [];
  let ci = 0, bi = 0;

  const sections = [...document.querySelectorAll<HTMLElement>('[data-band], [data-chapter]')];
  sections.forEach((sec, si) => {
    if (sec.dataset.band !== undefined) {
      // ---------- a category: a flourish in the open space, then the line draws its rule ----------
      const count = sec.querySelector('.band__count');
      const foot = sec.querySelector('.band__foot');
      if (!count || !foot) return;
      const c = docRect(count), f = docRect(foot);
      if (mobile) {
        b.bendTo({ x: left - gutter / 2, y: f.top });
      } else {
        // the rule is drawn toward the next chapter's moon and stops right above it, so the line
        // drops straight down the gap beside the category's copy, never across it
        const nextNode = sections[si + 1]?.querySelector('[data-line-node]');
        const endX = nextNode ? docRect(nextNode).x - LOOP : left - gutter * 0.5;
        const sideX = endX < vw * 0.3 ? right + gutter * 0.5 : left - gutter * 0.5;
        const run = endX > sideX ? 1 : -1;
        const dir = sideX > b.last.x ? 1 : -1;
        // out across the whitespace above the category, with a loop on the way
        const mid = { x: vw / 2 - dir * vw * 0.06, y: c.top - Math.min(110, (c.top - b.last.y) * 0.3) };
        b.bendAcross(mid, dir);
        b.flourish(bi % 2 ? 46 : 58, dir);
        // on to the side the rule starts from, down past the word, and along the rule
        b.curveTo({ x: b.last.x + dir * vw * 0.2, y: b.last.y }, { x: sideX, y: c.y - 20 }, { x: sideX, y: c.y + 30 });
        b.lineTo({ x: sideX, y: f.top - 26 });
        b.curveTo({ x: sideX, y: f.top - 8 }, { x: sideX + run * 12, y: f.top }, { x: sideX + run * 30, y: f.top });
        b.lineTo({ x: endX - run * 30, y: f.top });
        b.curveTo({ x: endX - run * 12, y: f.top }, { x: endX, y: f.top + 12 }, { x: endX, y: f.top + 30 });
      }
      b.mark(`band${bi}`);
      bi++;
      return;
    }

    // ---------- a chapter: loop its moon, run through its steps ----------
    const ch = sec;
    const node = ch.querySelector('[data-line-node]');
    if (!node) return;
    const n = docRect(node);
    const x = n.x - LOOP;
    const prevIsBand = sections[si - 1]?.dataset.band !== undefined;
    if (!mobile && !prevIsBand && ci > 0) {
      // across the gap between two chapters: a wide swing, with a flourish half the time
      const a = b.last;
      const gapMid = { x: (a.x + x) / 2 + (x > a.x ? -1 : 1) * vw * 0.12, y: (a.y + n.y - LOOP * 3.2) / 2 };
      const dir = x > a.x ? 1 : -1;
      b.bendAcross(gapMid, dir);
      if (ci % 2 === 1) b.flourish(40, dir);
      b.curveTo({ x: b.last.x + dir * 160, y: b.last.y }, { x, y: n.y - LOOP * 6 }, { x, y: n.y - LOOP * 3.2 });
    } else {
      b.flowTo({ x, y: n.y - LOOP * 3.2 });
    }
    b.lineTo({ x, y: n.y });
    b.loop(n, LOOP);
    b.mark(`node${ci}`);
    nodes.push({ el: node, label: `node${ci}` });
    ch.querySelectorAll('[data-line-step]').forEach((dot, k) => {
      const d = docRect(dot);
      b.lineTo({ x: d.x, y: d.y });
      b.mark(`c${ci}s${k}`);
      steps.push({ el: dot, label: `c${ci}s${k}` });
    });
    // run on toward the end of the body before crossing, so the swing happens in open space
    const body = ch.querySelector('.chapter__body')!;
    b.lineTo({ x: b.last.x, y: docRect(body).bottom - (mobile ? 0 : vh * 0.12) });
    ci++;
  });

  document.querySelectorAll<HTMLElement>('#practice [data-line-step]').forEach((dot, i) => {
    const d = docRect(dot);
    if (i === 0) {
      if (mobile) b.bendTo({ x: d.x, y: d.y - vh * 0.25 });
      else {
        const dir = d.x > b.last.x ? 1 : -1;
        b.bendAcross({ x: (b.last.x + d.x) / 2, y: (b.last.y + d.y - vh * 0.3) / 2 }, dir);
        b.flourish(52, dir);
        b.curveTo({ x: b.last.x + dir * 120, y: b.last.y }, { x: d.x, y: d.y - vh * 0.3 }, { x: d.x, y: d.y - vh * 0.12 });
      }
    }
    b.lineTo({ x: d.x, y: d.y });
    b.mark(`p${i}`);
    steps.push({ el: dot, label: `p${i}` });
  });

  // into the night: a long bend to the footer moon, then one full orbit around it
  const fm = docRect(footerMoon);
  const R = (fm.w / 2) * (mobile ? 1.22 : 1.34);
  const fc = { x: fm.x, y: fm.y };
  b.lineTo({ x: b.last.x, y: b.last.y + vh * 0.35 });
  b.bendTo({ x: fc.x - R, y: fc.y - R * 0.2 });
  b.lineTo({ x: fc.x - R, y: fc.y });
  b.mark('finale');
  b.loop(fc, R, 1.08, 0.96);

  // arc length, and the scroll at which the head reaches each point
  const pts = b.pts;
  const lens = new Array<number>(pts.length);
  const reach = new Array<number>(pts.length);
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  const segs = new Array<number>(pts.length).fill(0);
  let L = 0;
  lens[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    segs[i] = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    L += segs[i];
    lens[i] = L;
  }
  // Each point would like to be reached when it is level with HEAD. But loops, flourishes and
  // sideways runs have no height of their own, so taken literally they would be drawn in a few px
  // of scroll: the head would dash. Instead every px of line costs at least PACE px of scroll,
  // and the schedule is the one closest to the ideal that keeps that promise: the earliest
  // schedule that never runs early (forward) and the latest that never runs late (backward),
  // blended. Both keep the minimum pace, so their blend does too.
  const ideal = pts.map((p) => p.y - vh * HEAD);
  const fwd = new Array<number>(pts.length), bwd = new Array<number>(pts.length);
  fwd[0] = ideal[0];
  for (let i = 1; i < pts.length; i++) fwd[i] = Math.max(ideal[i], fwd[i - 1] + segs[i] * PACE);
  bwd[pts.length - 1] = ideal[pts.length - 1];
  for (let i = pts.length - 2; i >= 0; i--) bwd[i] = Math.min(ideal[i], bwd[i + 1] - segs[i + 1] * PACE);
  // Leaning toward late: a head that trails a little reads as the line following you, one that
  // runs ahead slips under the bottom edge.
  // It stays between 16% and 88% of the screen wherever the pace allows.
  for (let i = 0; i < pts.length; i++) reach[i] = Math.min(Math.max(fwd[i] * 0.6 + bwd[i] * 0.4, pts[i].y - vh * 0.88), pts[i].y - vh * 0.16);
  // ease the corners between paced and natural stretches: a moving average over ~240px of line
  // (an average of schedules that keep the pace keeps it too)
  const win = 240;
  const smoothed = new Array<number>(pts.length);
  let lo = 0, hi = 0, sum = 0;
  for (let i = 0; i < pts.length; i++) {
    while (hi < pts.length && lens[hi] <= lens[i] + win / 2) sum += reach[hi++];
    while (lens[lo] < lens[i] - win / 2) sum -= reach[lo++];
    smoothed[i] = sum / (hi - lo);
  }
  for (let i = 0; i < pts.length; i++) reach[i] = smoothed[i];
  // the window shrinks at the ends, so restate the promise exactly
  for (let i = 1; i < pts.length; i++) reach[i] = Math.max(reach[i], reach[i - 1] + segs[i] * PACE);
  // the footer orbit closes while its moon is still well in view, not at the very end of the page
  const last = pts.length - 1;
  const f = b.marks.get('finale')!;
  const r0 = Math.min(reach[f], maxScroll - 1);
  const r1 = Math.min(maxScroll, Math.max(r0 + (lens[last] - lens[f]) * PACE, fc.y - vh * 0.36));
  for (let k = f; k <= last; k++) reach[k] = r0 + ((r1 - r0) * (lens[k] - lens[f])) / Math.max(1, lens[last] - lens[f]);
  // and nothing before it may be scheduled later than it
  for (let k = f - 1; k >= 0; k--) reach[k] = Math.min(reach[k], reach[k + 1] - 1e-3);

  const at = (label: string) => lens[b.marks.get(label)!];
  return {
    pts, lens, reach, total: L,
    nodes: nodes.map((nd) => ({ el: nd.el, len: at(nd.label) })),
    steps: steps.map((s) => ({ el: s.el, len: at(s.label) })),
    finale: { len: at('finale'), c: fc, r: R },
    start,
  };
}

/** Arc length drawn at a given scroll. */
export function headAt(o: OrbitPath, scroll: number) {
  const r = o.reach;
  if (scroll <= r[0]) return 0;
  if (scroll >= r[r.length - 1]) return o.total;
  let lo = 0, hi = r.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (r[m] <= scroll) lo = m; else hi = m; }
  const t = (scroll - r[lo]) / Math.max(1e-6, r[hi] - r[lo]);
  return o.lens[lo] + (o.lens[hi] - o.lens[lo]) * t;
}

/** The point at an arc length. */
export function pointAt(o: OrbitPath, len: number): Pt {
  const l = o.lens;
  if (len <= 0) return o.pts[0];
  if (len >= o.total) return o.pts[o.pts.length - 1];
  let lo = 0, hi = l.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (l[m] <= len) lo = m; else hi = m; }
  const t = (len - l[lo]) / Math.max(1e-6, l[hi] - l[lo]);
  return { x: o.pts[lo].x + (o.pts[hi].x - o.pts[lo].x) * t, y: o.pts[lo].y + (o.pts[hi].y - o.pts[lo].y) * t };
}
