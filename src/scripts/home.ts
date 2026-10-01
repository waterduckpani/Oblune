import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { World } from '../lib/world/World';
import { EMBLEM_FILL } from '../lib/world/EmblemLayer';
import { Line, Bead, type Pt } from '../lib/world/line';
import { buildOrbit, headAt, pointAt, HEAD, type OrbitPath } from '../lib/orbitPath';
import { emblemPath, litToShader, PHASES } from '../lib/phase';
import { sound } from '../lib/audio';
import { app, type PageCtx, type PageHandle } from '../lib/app';
import { enter } from '../lib/enter';
import { kinetic, skewOnScroll, tonight, chromeMark, marquee } from '../lib/fx';

const EASE = 'expo.out';
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (from: number, to: number, l: number, dt: number) => from + (to - from) * (1 - Math.exp(-l * dt));
const mobileQ = matchMedia('(max-width: 860px)');

// ---------- The world outlives the page: made on the first visit home, reused on every return ----------
let world: World | null = null;
let worldFailed = false;
let line: Line | null = null;
let bead: Bead | null = null;
function getWorld() {
  if (world || worldFailed) return world;
  try {
    world = new World(document.querySelector<HTMLCanvasElement>('[data-world]')!);
    line = new Line({ width: 2.2, ghostWidth: 3, ghostAlpha: 0.3, dash: 11, alpha: 0.9 });
    bead = new Bead();
    world.back.add(line.mesh);
    world.front.add(bead.mesh);
    Object.assign((window as unknown as { __oblune: object }).__oblune ?? {}, { world, line, bead });
  } catch (err) {
    console.warn('WebGL unavailable, showing stills instead', err);
    worldFailed = true;
    document.documentElement.classList.add('no-webgl');
  }
  return world;
}

export function mount({ scope, view, first }: PageCtx): PageHandle {
  const { reduced, coarse } = app;
  const lenis = app.lenis;
  const chrome = app.chrome;
  const $ = <T extends Element = HTMLElement>(s: string) => view.querySelector<T>(s)!;
  const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = view) => [...r.querySelectorAll<T>(s)];
  const velocity = () => lenis?.velocity ?? 0;
  const quick = !first || document.documentElement.classList.contains('quick');

  chrome.setMode('home');
  tonight(view);
  sound.scene('hero');

  const w = getWorld();
  const canvas = document.querySelector<HTMLCanvasElement>('[data-world]')!;
  if (w) {
    canvas.hidden = false;
    if (!quick && !reduced) canvas.classList.add('world--top');
    w.resize();
  }
  const chapters = $$('[data-chapter]');
  w?.bindChapters(chapters);

  // ---------- The orbit line: drawn by the scroll, played by the pointer ----------
  let orbit: OrbitPath | null = null;
  let buckets: number[][] = [];
  const BUCKET = 60;
  const buildLine = () => {
    if (!w || !line) return;
    orbit = buildOrbit({ vh: innerHeight, mobile: mobileQ.matches });
    if (!orbit) return;
    line.setPoints(orbit.pts);
    ((window as unknown as { __oblune?: Record<string, unknown> }).__oblune ?? {}).orbit = orbit;
    line.material.uniforms.uTail.value = 0;
    line.material.uniforms.uFade.value = 70;
    buckets = [];
    orbit.pts.forEach((p, i) => { const b = Math.floor(p.y / BUCKET); (buckets[b] ??= []).push(i); });
  };
  if (line) line.geometry.setDrawRange(0, 0);

  // ---------- The moon's journey: loader → hero → index → becomes the bead → full moon at night ----------
  const anchors = {
    hero: $('[data-moon-anchor="hero"]'),
    index: $('[data-moon-anchor="index"]'),
    footer: $('[data-moon-anchor="footer"]'),
  };
  const indexSection = $('[data-index]');
  const indexRows = $$<HTMLAnchorElement>('[data-index-row]');
  const readout = $('[data-readout]');
  const readoutLabel = $('[data-readout-label]');
  const dusk = $('[data-dusk]');
  const sky = $('[data-sky]');
  const storySections = $$('[data-band], [data-chapter]');
  const bandWords = $$('[data-band-word]');
  const practice = $('#practice');
  const contact = $('#contact');
  const dial = view.querySelector<SVGSVGElement>('[data-dial]');
  const dialSpin = view.querySelector<SVGGElement>('[data-dial-spin]');
  const dialNeedle = view.querySelector<SVGGElement>('[data-dial-needle]');

  type R = { x: number; y: number; w: number };
  const rectOf = (el: Element): R => {
    const r = el.getBoundingClientRect();
    const d = Math.min(r.width, r.height) / EMBLEM_FILL;
    return { x: r.left + r.width / 2 - d / 2, y: r.top + r.height / 2 - d / 2, w: d };
  };
  const around = (p: Pt, d: number): R => { const q = d / EMBLEM_FILL; return { x: p.x - q / 2, y: p.y - q / 2, w: q }; };
  const mix = (a: R, b: R, t: number): R => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t) });
  const centre = (r: R) => ({ x: r.x + r.w / 2, y: r.y + r.w / 2 });

  const moon = {
    load: reduced || quick ? 1 : 0,
    form: reduced || quick ? 1 : 0,
    merged: reduced || quick ? 1 : 0,
    turn: 0,
    cycle: 0,
    tilt: { x: 0, y: 0 },
    light: { x: 0, y: 0 },
    indexLit: PHASES.crescent.lit,
    hoverLit: -1,
    drop: { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0 },
    grabbed: false,
  };
  const dialIn = { v: reduced ? 1 : 0 };
  const moonAlpha = { v: reduced ? 1 : 0 };
  let night = 0;
  const LITS = chapters.map((c) => Number(c.dataset.lit));

  // the bead: springs after the head, stretches as it moves, and is drawn to the pointer
  const bd = { x: -100, y: -100, vx: 0, vy: 0, ring: 0, ringA: 0, held: false, seen: false };
  const pulse = (big = false) => {
    if (reduced) return;
    gsap.fromTo(bd, { ring: big ? 10 : 7, ringA: big ? 0.8 : 0.55 }, { ring: big ? 64 : 34, ringA: 0, duration: big ? 1.1 : 0.8, ease: 'power2.out', overwrite: true });
  };

  let lastRipple = { x: 0, y: 0, t: 0 };
  const hovering = new Set<Element>();
  if (w && !coarse && !reduced) {
    [anchors.hero, anchors.footer].forEach((a) => {
      scope.on(a, 'pointerenter', () => hovering.add(a));
      scope.on(a, 'pointerleave', () => hovering.delete(a));
    });
  }
  $$('[data-moon-cycle]').forEach((b) => scope.on(b, 'click', () => {
    sound.arpeggio(true);
    if (reduced || !w) return;
    w.emblem.ripple(0, 0, 1.6, w.time);
    gsap.fromTo(moon, { cycle: 0 }, { cycle: 1, duration: 2.4, ease: 'none' });
    gsap.fromTo(moon, { turn: 0 }, { turn: Math.PI * 2, duration: 2.4, ease: 'power3.inOut', onComplete: () => { moon.turn = 0; } });
  }));

  // index rows: scroll walks through them; hovering one shows its phase
  let rowNow = -1;
  function activeRow(i: number) {
    if (i === rowNow) return;
    rowNow = i;
    indexRows.forEach((r, k) => (r.dataset.active = String(k === i)));
    readoutLabel.textContent = indexRows[i]?.dataset.label ?? '';
  }
  indexRows.forEach((row) => {
    const on = () => { moon.hoverLit = Number(row.dataset.lit); activeRow(Number(row.dataset.indexRow)); };
    const off = () => { moon.hoverLit = -1; };
    scope.on(row, 'pointerenter', on); scope.on(row, 'focus', on);
    scope.on(row, 'pointerleave', off); scope.on(row, 'blur', off);
  });
  const indexList = $('[data-index-list]');
  $$('[data-chip]').forEach((chip) => {
    const on = () => {
      indexList.dataset.focus = chip.dataset.chip!;
      indexRows.forEach((r) => r.toggleAttribute('data-lit-cat', r.dataset.cat === chip.dataset.chip));
    };
    const off = () => { delete indexList.dataset.focus; indexRows.forEach((r) => r.removeAttribute('data-lit-cat')); };
    scope.on(chip, 'pointerenter', on); scope.on(chip, 'focus', on);
    scope.on(chip, 'pointerleave', off); scope.on(chip, 'blur', off);
  });
  activeRow(0);

  // steps: a dot is passed once it rises above the line's head
  const stepGroups = chapters.map((c) => {
    const disc = c.querySelector<SVGSVGElement>('[data-disc]')!;
    return {
      section: c,
      slug: c.dataset.chapter!,
      name: c.querySelector('[data-chapter-name]')!.textContent!.trim(),
      caseHref: c.dataset.case!,
      items: $$('.chapter__step', c),
      dots: $$('[data-line-step]', c),
      caption: c.querySelector<HTMLElement>('[data-caption]')!,
      steps: $$('.chapter__steps', c)[0],
      panel: c.querySelector<HTMLElement>('[data-stage-panel]')!,
      discShadow: disc.querySelector<SVGCircleElement>('[data-disc-shadow]')!,
      ticks: $$<SVGCircleElement>('[data-tick]', disc),
      lits: JSON.parse(disc.dataset.discLits!) as number[],
      current: -1,
      near: false,
    };
  });
  let lastStepSound = 0;

  // ---------- Practice: a moon that fills by quarters ----------
  const prRows = $$('[data-practice-row]');
  const prShadow = view.querySelector<SVGCircleElement>('[data-practice-shadow]');
  const prGlint = view.querySelector<SVGRectElement>('[data-practice-glint]');
  const prPct = view.querySelector<HTMLElement>('[data-practice-pct]');
  const prCap = view.querySelector<HTMLElement>('[data-practice-cap]');
  const prArcs = $$<SVGPathElement>('[data-arc]');
  const prNums = $$<SVGTextElement>('[data-arc-n]');
  const prNames = prRows.map((r) => r.querySelector('.practice__name')!.textContent!.trim());
  let prNow = -1, prHover = -1, prPassed = 0;
  const prCount = { v: 25 };
  function practiceQuarter(q: number) {
    if (q === prNow) return;
    const first = prNow === -1;
    prNow = q;
    practice.dataset.q = String(q);
    const lit = (q + 1) / 4;
    prRows.forEach((r, i) => (r.dataset.active = String(i === q)));
    prArcs.forEach((a, i) => (a.dataset.on = String(i <= q)));
    prNums.forEach((a, i) => (a.dataset.on = String(i <= q)));
    prShadow?.setAttribute('cx', (-2 * 48 * lit - (q === 3 ? 12 : 0)).toFixed(2));
    if (prGlint) prGlint.style.transform = `translate(${(q - 1.5) * 14}px, ${(q - 1.5) * 8}px)`;
    if (prCap) prCap.textContent = q === 3 ? 'The whole product, by one person' : `of the whole product · ${prNames[q]}`;
    if (prPct) {
      if (reduced || first) prPct.textContent = String(Math.round(lit * 100));
      else gsap.to(prCount, { v: lit * 100, duration: 0.9, ease: 'power3.out', overwrite: true, onUpdate: () => { prPct.textContent = String(Math.round(prCount.v)); } });
    }
    if (!first) { sound.chime(q + 1, 0.55); if (q === 3) setTimeout(() => sound.arpeggio(true), 250); }
  }
  prRows.forEach((r, i) => {
    scope.on(r, 'pointerenter', () => { prHover = i; practiceQuarter(i); });
    scope.on(r, 'pointerleave', () => { prHover = -1; });
  });
  practiceQuarter(0);

  // ---------- The loader's slot, for the flight to the hero ----------
  const loaderSlot = view.querySelector('[data-loader-slot]') as SVGCircleElement | null;
  let loaderFrozen: R | null = null;
  const loaderRectNow = () => { const lr = loaderSlot!.getBoundingClientRect(); return around({ x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 }, lr.width); };

  // the pointer strums the line: if its path crosses a drawn segment, the line rings there
  const prevP = { x: -1, y: -1 };
  let pluckAt = 0;
  function strum(wd: World, S: number, Lh: number, t: number) {
    const p = wd.pointer;
    const ax = prevP.x, ay = prevP.y + S, bx = p.px, by = p.py + S;
    const moved = prevP.x >= 0 && (prevP.x !== p.px || prevP.y !== p.py);
    prevP.x = p.px; prevP.y = p.py;
    if (!orbit || !line || !moved || p.px < 0 || coarse || reduced || t - pluckAt < 0.07) return;
    const b0 = Math.floor(Math.min(ay, by) / BUCKET) - 1, b1 = Math.floor(Math.max(ay, by) / BUCKET) + 1;
    for (let b = b0; b <= b1; b++) {
      for (const i of buckets[b] ?? []) {
        if (i === 0 || orbit.lens[i] > Lh) continue;
        const q = orbit.pts[i], o = orbit.pts[i - 1];
        const d1 = (bx - ax) * (o.y - ay) - (by - ay) * (o.x - ax);
        const d2 = (bx - ax) * (q.y - ay) - (by - ay) * (q.x - ax);
        const d3 = (q.x - o.x) * (ay - o.y) - (q.y - o.y) * (ax - o.x);
        const d4 = (q.x - o.x) * (by - o.y) - (q.y - o.y) * (bx - o.x);
        if (d1 * d2 < 0 && d3 * d4 < 0) {
          const speed = Math.hypot(bx - ax, by - ay);
          line.pluck(orbit.lens[i], Math.min(16, 3 + speed * 0.35), d3 > 0 ? 1 : -1, t);
          sound.pluck(Math.floor(orbit.lens[i] / 260) % 8, Math.min(1, 0.35 + speed / 60));
          pluckAt = t;
          return;
        }
      }
    }
  }
  // touching the bead makes it jump and ring
  if (w && !reduced) scope.on(window, 'pointerdown', (e) => {
    if (!bd.seen || Math.hypot(e.clientX - bd.x, e.clientY - bd.y) > 26) return;
    bd.vx += (Math.random() - 0.5) * 900; bd.vy -= 700;
    pulse(true);
    sound.bloop(0.8);
    if (orbit && line) line.pluck(headAt(orbit, scrollY), 10, 1, w.time);
  });

  let sheenAt = new Map<Element, number>();
  let drawn = -1;
  function frameHook(t: number, dt: number) {
    const wd = w!;
    const vh = wd.vh;
    const S = scrollY;
    const es = wd.emblemState;
    const headY = vh * HEAD;
    // the head follows the scroll on a short spring with a top speed, so a flick of the wheel
    // draws the line quickly but never makes it jump; a jump across the page (under the curtain) snaps
    const want = orbit ? (reduced ? orbit.total : headAt(orbit, S)) : 0;
    const gap = want - drawn;
    if (!orbit || Math.abs(gap) > vh * 3 || drawn < 0) drawn = want;
    else {
      const step = gap * (1 - Math.exp(-16 * dt));
      const maxStep = Math.max(2400, Math.abs(gap) * 1.5) * dt;
      drawn += Math.max(-maxStep, Math.min(maxStep, step));
    }
    const Lh = drawn;
    const mobile = mobileQ.matches;

    // --- steps and dots: each dot the line passes plays a note and moves the product on ---
    stepGroups.forEach((g, ci) => {
      const sr = g.section.getBoundingClientRect();
      g.near = sr.bottom > -vh && sr.top < vh * 2;
      if (!g.near && g.current !== -1) return;
      let active = 0;
      const tops = g.dots.map((d) => d.getBoundingClientRect().top);
      tops.forEach((top, i) => {
        const passed = top + 6 < headY;
        if (passed) active = i;
        const li = g.items[i];
        if (li.dataset.passed !== String(passed)) li.dataset.passed = String(passed);
      });
      if (active !== g.current) {
        const firstTime = g.current === -1;
        g.current = active;
        g.items.forEach((li, i) => (li.dataset.active = String(i === active)));
        g.ticks.forEach((tk, i) => (tk.dataset.on = String(i <= active)));
        g.section.dataset.step = String(active);
        wd.chapters[ci]?.setStep(active);
        g.caption.textContent = g.items[active].querySelector('.chapter__step-title')!.textContent;
        g.discShadow.setAttribute('cx', (-2 * 48 * g.lits[active]).toFixed(2));
        if (!firstTime && t - lastStepSound > 0.15) {
          sound.chime(active, 0.7);
          lastStepSound = t;
          const s = orbit?.steps.find((x) => x.el === g.dots[active]);
          if (s) line?.pluck(s.len, 5, 1, t);
          pulse();
        }
      }
      // on phones the steps scroll up beneath a pinned stage: hide what is behind it
      if (mobile) {
        const pr = g.panel.getBoundingClientRect(), str = g.steps.getBoundingClientRect();
        const cut = Math.max(0, pr.bottom + 10 - str.top);
        g.steps.style.clipPath = cut > 0 ? `inset(${cut}px 0 0 0)` : '';
      } else if (g.steps.style.clipPath) g.steps.style.clipPath = '';
    });
    // practice: the quarter follows the line, unless you are pointing at one
    let passedQ = -1;
    prRows.forEach((row, i) => {
      const dot = row.querySelector('[data-line-step]')!;
      const passed = dot.getBoundingClientRect().top + 6 < headY;
      if (passed) passedQ = i;
      const v = String(passed);
      if (row.dataset.passed !== v) row.dataset.passed = v;
    });
    if (passedQ !== prPassed) { prPassed = passedQ; if (passedQ >= 0) pulse(); }
    if (prHover < 0) practiceQuarter(Math.max(0, passedQ));

    // --- night falls over the last stretch ---
    const dr = dusk.getBoundingClientRect();
    const n = smooth(0.12, 0.62, (vh * 0.5 - dr.top) / dr.height);
    if (Math.abs(n - night) > 0.001 || (n === 0) !== (night === 0)) { sky.style.opacity = n.toFixed(3); }
    night = n;
    const isNight = night > 0.5;
    if ((document.documentElement.dataset.night === 'true') !== isNight) document.documentElement.dataset.night = String(isNight);
    wd.stars.material.uniforms.uAlpha.value = night;
    wd.stars.material.uniforms.uDrift.value = (S / vh) * 0.02;
    sound.night(night);

    // --- where the moon is ---
    const ir = indexSection.getBoundingClientRect();
    const a = clamp(1 - ir.top / vh);                                   // hero → index
    const q = clamp(-ir.top / Math.max(1, ir.height - vh));             // through the index
    const pinEnd = ir.bottom + S - vh;
    const m1 = orbit ? smooth(pinEnd, pinEnd + vh * 0.55, S) : 0;       // index → the line
    const m2 = orbit ? smooth(orbit.finale.len - vh * 0.5, orbit.finale.len, Lh) : 0; // line → footer
    const beadR = mobile ? 6 : 8.5;

    // --- the line, and the bead at its head ---
    let head = { x: -100, y: -100 };
    if (orbit && line && bead) {
      const hp = pointAt(orbit, Lh);
      head = { x: hp.x, y: hp.y - S };
      const p = wd.pointer;
      // drawn toward the pointer when it comes close, and let go with a pluck
      let tx = head.x, ty = head.y;
      const near = !coarse && !reduced && p.px >= 0 ? Math.hypot(p.px - head.x, p.py - head.y) : 1e9;
      const reachR = 120;
      const held = near < reachR && m1 > 0.9 && m2 < 0.2;
      if (held) {
        const k = Math.pow(1 - near / reachR, 0.6) * 0.62;
        tx = lerp(head.x, p.px, k); ty = lerp(head.y, p.py, k);
      }
      if (held !== bd.held) {
        bd.held = held;
        if (held) sound.bloop(0.4);
        else { sound.pluck(3, 0.6); line.pluck(Lh, 9, 1, t); }
      }
      if (!bd.seen || reduced) { bd.x = tx; bd.y = ty; bd.vx = bd.vy = 0; bd.seen = true; }
      // a slightly underdamped spring: it lags on sharp turns and settles with a wobble
      const k = held ? 90 : 170, c = held ? 12 : 15;
      const sub = Math.min(4, Math.ceil(dt / 0.008));
      for (let i = 0; i < sub; i++) {
        const h = dt / sub;
        bd.vx += (-k * (bd.x - tx) - c * bd.vx) * h; bd.x += bd.vx * h;
        bd.vy += (-k * (bd.y - ty) - c * bd.vy) * h; bd.y += bd.vy * h;
      }
      // never too far from the line it belongs to
      let ox = bd.x - head.x, oy = bd.y - head.y;
      const ol = Math.hypot(ox, oy), maxL = held ? 140 : 90;
      if (ol > maxL) { ox *= maxL / ol; oy *= maxL / ol; bd.x = head.x + ox; bd.y = head.y + oy; }

      line.frame(wd.vw, vh, wd.dpr, S, t);
      const lu = line.material.uniforms;
      lu.uHead.value = Lh;
      lu.uHeadLen.value = Lh;
      (lu.uPull.value as { set(x: number, y: number): void }).set(ox, oy);
      const ink = lerp(0.078, 0.925, night);
      lu.uColorA.value.setRGB(ink, ink, lerp(0.086, 0.913, night));
      lu.uAlpha.value = lerp(0.9, 0.74, night);
      const clip = lu.uClip.value;
      clip.set(0, 0, 0, 0);
      if (mobile) {
        for (const g of stepGroups) {
          if (!g.near) continue;
          const r = g.panel.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vh) { clip.set(0, r.top, wd.vw, r.height); break; }
        }
      }
      strum(wd, S, Lh, t);

      const bu = bead.material.uniforms;
      const show = smooth(0.62, 1, m1) * (1 - smooth(0.25, 0.85, m2));
      const speed = Math.hypot(bd.vx, bd.vy);
      bu.uViewport.value.set(wd.vw, vh);
      bu.uCenter.value.set(bd.x, bd.y);
      bu.uDpr.value = wd.dpr;
      bu.uRadius.value = beadR * (held ? 1.4 : 1) * lerp(0.3, 1, show);
      if (speed > 1) bu.uDir.value.set(bd.vx / speed, bd.vy / speed);
      bu.uStretch.value = 1 + Math.min(0.75, speed / 1300);
      bu.uColor.value.setRGB(ink, ink, lerp(0.086, 0.913, night));
      bu.uAlpha.value = show;
      // a faint halo breathes around it; steps and touches send a ring out from it
      const breath = beadR * 1.9 + Math.sin(t * 2.2) * 1.4;
      const ringR = held ? beadR * 2.6 : bd.ringA > 0.12 ? bd.ring : breath;
      const ringA = held ? 0.45 : Math.max(bd.ringA, 0.16 * show);
      bu.uRing.value.set(Math.max(ringR, beadR + 3), ringA, 1.2);
      bead.mesh.visible = show > 0.004;
    }

    let rect: R, lit: number, shadow = 1, alphaMul = 1;
    if (moon.load < 1) {
      rect = mix(loaderFrozen ?? loaderRectNow(), rectOf(anchors.hero), ease(moon.load));
      lit = 0.75;
      shadow = moon.load;
    } else if (a < 1) {
      rect = mix(rectOf(anchors.hero), rectOf(anchors.index), ease(a));
      lit = lerp(0.75, moon.indexLit, ease(a));
    } else if (m1 <= 0 || !orbit) {
      rect = rectOf(anchors.index);
      lit = moon.indexLit;
    } else if (m2 <= 0) {
      // the moon shrinks into a drop of ink, and the drop is the bead
      rect = mix(rectOf(anchors.index), around(head, beadR * 3), ease(m1));
      lit = lerp(moon.indexLit, 1, m1);
      shadow = lerp(1, 0.4, m1);
      alphaMul = 1 - smooth(0.55, 0.92, m1);
    } else {
      // and at the end, the bead swells back into the full moon
      rect = mix(around({ x: bd.x, y: bd.y }, beadR * 3), rectOf(anchors.footer), ease(m2));
      lit = 1;
      shadow = lerp(0.4, 1, m2);
      alphaMul = smooth(0.05, 0.4, m2);
    }

    // index: the scroll walks the rows, a hovered row takes over
    if (a >= 1 && q < 1) {
      const row = Math.min(indexRows.length - 1, Math.floor(q * indexRows.length * 1.08));
      if (moon.hoverLit < 0) activeRow(row);
    }
    const wantLit = moon.hoverLit >= 0 ? moon.hoverLit : Number(indexRows[rowNow]?.dataset.lit ?? 0.3);
    moon.indexLit = damp(moon.indexLit, wantLit, 5, dt);
    const pct = String(Math.round(moon.indexLit * 100));
    if (readout.textContent !== pct) readout.textContent = pct;

    // the island says where you are, and offers the way into each chapter's case study
    const cr = contact.getBoundingClientRect(), prr = practice.getBoundingClientRect();
    let scene = 'hero';
    if (cr.top < vh * 0.5) { chrome.setNow('Work with me', 1); scene = 'night'; }
    else if (prr.top < vh * 0.5) { chrome.setNow('Practice', (Math.max(0, prNow) + 1) / 4); scene = 'practice'; }
    else {
      let hit: HTMLElement | null = null;
      for (const s of storySections) { if (s.getBoundingClientRect().top < vh * 0.5) hit = s; else break; }
      if (hit?.dataset.chapter) {
        const i = chapters.indexOf(hit);
        const g = stepGroups[i];
        chrome.setNow(g.name, LITS[i], { href: g.caseHref, label: 'Case study' });
        scene = g.slug;
      } else if (hit?.dataset.band) {
        chrome.setNow(hit.querySelector('[data-band-word]')!.textContent!, 0.75);
        scene = 'index';
      } else if (ir.top < vh * 0.5) { chrome.setNow('The work', moon.indexLit); scene = 'index'; }
      else chrome.setNow('Oblune Studio', 0.75);
    }
    sound.scene(scene);

    // category words: the highlight in the metal travels as they cross the screen (only when it moves)
    for (const b of bandWords) {
      const r = b.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const v = Math.round((clamp(1 - (r.top + r.height / 2) / vh) * 130 - 15) * 2) / 2;
      if (sheenAt.get(b) === v) continue;
      sheenAt.set(b, v);
      b.style.setProperty('--sheen', `${v}%`);
    }

    // a full cycle on click: to new, to full, back
    let phaseLit = lit;
    if (moon.cycle > 0 && moon.cycle < 1) {
      const c = moon.cycle;
      phaseLit = c < 0.3 ? lerp(lit, 0, ease(c / 0.3)) : c < 0.8 ? lerp(0, 1, ease((c - 0.3) / 0.5)) : lerp(1, lit, ease((c - 0.8) / 0.2));
    }
    const phase = litToShader(phaseLit) + smooth(0.97, 1, phaseLit) * 0.08;

    if (dial && dialNeedle && dialSpin && a < 0.4) {
      const cyc = moon.cycle > 0 && moon.cycle < 1 ? moon.cycle * 360 : 0;
      const needle = (Math.acos(1 - 2 * clamp(phaseLit)) / Math.PI) * 180 + cyc;
      dialNeedle.setAttribute('transform', `rotate(${needle.toFixed(2)})`);
      dialSpin.setAttribute('transform', `rotate(${(moon.tilt.x * 18 + t * 1.5).toFixed(2)})`);
      dial.style.opacity = String((1 - smooth(0, 0.3, a)) * dialIn.v);
    } else if (dial && dial.style.opacity !== '0') dial.style.opacity = '0';

    // pointer: tilt toward it, the light follows, the surface ripples, and near the rim it pulls a droplet out
    const p = wd.pointer;
    const drift = 1 - smooth(4, 7, t);
    moon.tilt.x = damp(moon.tilt.x, p.x * 0.42 + Math.sin(t * 0.35) * 0.08 * drift, 3.2, dt);
    moon.tilt.y = damp(moon.tilt.y, p.y * 0.3 + Math.cos(t * 0.27) * 0.05 * drift, 3.2, dt);
    moon.light.x = damp(moon.light.x, p.x * 0.5, 2, dt);
    moon.light.y = damp(moon.light.y, -p.y * 0.3, 2, dt);
    const spin = a > 0 && a < 1 ? Math.sin(a * Math.PI) * 1.1 : 0;
    for (const el of hovering) {
      const r = rectOf(el);
      const lx = (p.px - (r.x + r.w / 2)) / (r.w / 2), ly = -(p.py - (r.y + r.w / 2)) / (r.w / 2);
      if (Math.hypot(lx - lastRipple.x, ly - lastRipple.y) > 0.09 && t - lastRipple.t > 0.05) {
        wd.emblem.ripple(lx, ly, 0.55, t);
        lastRipple = { x: lx, y: ly, t };
      }
    }
    const big = ((a < 0.02 && moon.load >= 1) || m2 > 0.98) && !coarse && !reduced;
    const c0 = centre(rect);
    const QUAD = 0.37 * 4.2;
    const wx = ((p.px - c0.x) / (rect.w / 2)) * QUAD, wy = (-(p.py - c0.y) / (rect.w / 2)) * QUAD;
    const dist = Math.hypot(wx, wy);
    const nearRim = big && p.px >= 0 && dist > 0.9 && dist < 1.75;
    const reachD = Math.min(dist, 1.3);
    const d = moon.drop;
    const tx = nearRim ? (wx / dist) * reachD : d.x * 0.9;
    const ty = nearRim ? (wy / dist) * reachD : d.y * 0.9;
    const tr = nearRim ? 0.2 * smooth(1.75, 1.12, dist) : 0;
    const K = 90, C = 11;
    d.vx += (-K * (d.x - tx) - C * d.vx) * dt; d.x += d.vx * dt;
    d.vy += (-K * (d.y - ty) - C * d.vy) * dt; d.y += d.vy * dt;
    d.vr += (-K * (d.r - tr) - C * d.vr) * dt; d.r = Math.max(0, d.r + d.vr * dt);
    if (d.r > 0.08 && !moon.grabbed) { moon.grabbed = true; sound.bloop(0.5); }
    if (d.r < 0.03 && moon.grabbed) { moon.grabbed = false; sound.bloop(0.3); }

    const drops = [{ x: d.x, y: d.y, z: 0, r: d.r > 0.012 ? d.r : 0 }];
    if (moon.merged < 1) {
      const f = moon.form;
      for (let i = 0; i < 5; i++) {
        const th = t * (0.9 + i * 0.08) + (i * Math.PI * 2) / 5;
        const rad = lerp(1.3, 0.25, ease(f)) * (1 + Math.sin(t * 2 + i) * 0.05);
        const r = lerp(0.19, 0.1, f) * (1 - moon.merged);
        drops.push({ x: Math.cos(th) * rad, y: Math.sin(th) * rad * 0.9, z: Math.sin(th * 1.3) * 0.15, r });
      }
    }

    es.rect = rect;
    es.phase = phase;
    es.tilt = { x: moon.tilt.x + moon.turn + spin, y: moon.tilt.y };
    es.light = moon.light;
    es.alpha = moonAlpha.v * alphaMul;
    es.shadow = shadow;
    es.night = night;
    es.drops = drops;
    es.body = reduced ? 1 : smooth(0.2, 1, moon.form);
  }

  if (w) {
    w.hooks.length = 0;
    w.hooks.push(frameHook);
    // the world rests while a window covers it
    scope.tick((_, delta) => { if (!app.paused) w.frame(Math.min(delta / 1000, 1 / 20)); });
  }

  // ---------- Loader: mercury gathers into the moon, the letters arrive, then the logo splits ----------
  const loader = view.querySelector<HTMLElement>('[data-loader]');
  const navBrand = document.querySelector<HTMLElement>('[data-nav-brand]')!;
  const island = chrome.island;
  let entered = false;

  function arrive() {
    try { sessionStorage.setItem('oblune:seen', '1'); } catch { /* private mode */ }
    const h = decodeURIComponent(location.hash);
    if (first && h.startsWith('#code/')) app.repos.fromHash();
    else if (first && h.length > 1) requestAnimationFrame(() => { ScrollTrigger.refresh(); buildLine(); const y = targetY(h); if (y) lenis?.scrollTo(y, { immediate: true, force: true }); });
  }

  function intro() {
    document.documentElement.classList.add('is-ready');
    buildLine();
    chrome.sizeIsland();
    if (reduced) { gsap.set(navBrand, { opacity: 1 }); return; }
    scope.gsap(() => {
      gsap.fromTo(moon, { turn: -1.2 }, { turn: 0, duration: 2.2, ease: 'expo.out' });
      gsap.to(dialIn, { v: 1, duration: 1.6, ease: 'power2.out', delay: 0.5 });
      gsap.fromTo('[data-dial-spin] line', { opacity: 0 }, { opacity: 1, duration: 0.02, stagger: { each: 0.012, from: 'start' }, delay: 0.5 });
      const title = $('[data-hero-title]');
      title.setAttribute('aria-label', title.textContent!.replace(/\s+/g, ' ').trim());
      const lines = $$('.hero__line', title);
      lines.forEach((s) => s.setAttribute('aria-hidden', 'true'));
      gsap.set(lines, { opacity: 1 });
      const split = SplitText.create(lines, { type: 'lines', mask: 'lines', aria: 'none' });
      gsap.from(split.lines, {
        yPercent: 120, duration: 1.6, ease: EASE, stagger: 0.12, delay: 0.1,
        onComplete: () => { split.revert(); if (!coarse && !scope.dead) kinetic($$('.hero__line', title), scope); },
      });
      gsap.fromTo('[data-hero-foot]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.3, ease: EASE, delay: 0.55, stagger: 0.06 });
    });
    if (first) {
      gsap.to(island, { opacity: 1, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.6)', delay: 0.6 });
      gsap.fromTo('.nav__end > *', { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 1, ease: EASE, stagger: 0.06, delay: 0.5 });
    }
  }

  const readyMoon = () => {
    if (!w || reduced) return;
    gsap.to(moonAlpha, { v: 1, duration: quick ? 0.8 : 0.01, ease: 'power2.out' });
  };

  if (quick || reduced || !loader) {
    // straight in: no loader, the moon already at the hero
    loader?.remove();
    canvas.classList.remove('world--top');
    view.querySelector('main')?.removeAttribute('aria-busy');
    if (reduced) moonAlpha.v = 1;
    if (w) w.warm().then(readyMoon); else readyMoon();
    if (!first) { gsap.set(navBrand, { opacity: 1 }); }
    // arriving from another page, the intro plays as the curtain lifts
    if (first) { intro(); arrive(); }
    else { document.documentElement.classList.add('is-ready'); buildLine(); }
  } else {
    const logo = $('[data-loader-logo]');
    const ringEl = $<SVGCircleElement>('[data-loader-ring]');
    const loaderMoon = $<SVGPathElement>('[data-loader-moon]');
    const letters = $<SVGPathElement>('[data-loader-letters]');
    const clipRect = $<SVGRectElement>('[data-loader-clip]');
    const count = $('[data-loader-count]');
    const shown = { v: 0 };
    let target = 0;
    gsap.set(navBrand, { opacity: 0 });
    gsap.set(island, { opacity: 0, y: -16 });
    const tasks: Promise<unknown>[] = [document.fonts.ready.then(() => (target += 0.25))];
    if (w) {
      tasks.push(w.warm().then(() => {
        target += 0.35;
        moonAlpha.v = 1;
        gsap.to(loaderMoon, { opacity: 0, duration: 0.5, ease: 'power2.out' });
      }));
      const firstStage = w.chapters[0];
      tasks.push(Promise.allSettled((firstStage?.urls.slice(0, 2) ?? []).map((u) => fetch(u).then((r) => r.blob()))).then(() => (target += 0.4)));
    } else target += 0.75;
    const tickLoader = () => {
      shown.v += (Math.min(target, 1) - shown.v) * 0.06;
      const v = shown.v;
      moon.form = v;
      ringEl.style.strokeDashoffset = String(-v * 0.25);
      loaderMoon.setAttribute('d', emblemPath(v * 0.75));
      count.textContent = String(Math.round(v * 100)).padStart(3, '0');
    };
    gsap.ticker.add(tickLoader);
    scope.add(() => gsap.ticker.remove(tickLoader));
    const minTime = new Promise((r) => setTimeout(r, 1800));
    const maxTime = new Promise((r) => setTimeout(r, 8000));
    lenis?.stop();
    Promise.race([Promise.all([...tasks, minTime]), maxTime]).then(() => {
      if (scope.dead) return;
      target = 1;
      gsap.delayedCall(0.35, ready);
    });
    function ready() {
      gsap.ticker.remove(tickLoader);
      count.textContent = '100';
      moon.form = 1;
      loaderMoon.setAttribute('d', emblemPath(0.75));
      gsap.to(moon, { merged: 1, duration: 0.8, ease: 'power2.in' });
      gsap.timeline()
        .to(logo, { translate: '0% 0', duration: 1, ease: 'expo.inOut' }, 0.2)
        .to(clipRect, { attr: { width: 270 }, duration: 1, ease: 'expo.inOut' }, 0.25)
        .to('.loader__count', { opacity: 0, duration: 0.4 }, 0.6)
        // the logo is whole: the way in, if the browser wants a press before it lets sound play
        .add(() => { enter('loader').then(() => gsap.delayedCall(0.15, go)); }, 1.35);
    }
    function go() {
      if (entered || scope.dead) return;
      entered = true;
      gsap.set(['.hero__line', '[data-hero-foot]'], { opacity: 0 });
      view.querySelector('main')?.removeAttribute('aria-busy');
      document.querySelector('[data-loader-status]')!.textContent = 'Loaded';
      gsap.to([ringEl, '.loader__note'], { opacity: 0, duration: 0.35 });
      loaderFrozen = loaderRectNow();
      // FLIP the whole logo so its letters land exactly on the nav's letters
      const D = logo.getBoundingClientRect();
      const F = letters.getBoundingClientRect();
      const T = document.querySelector('[data-nav-letters]')!.getBoundingClientRect();
      if (T.width > 0) {
        const k = T.width / F.width;
        gsap.set(logo, { transformOrigin: '0 0' });
        gsap.to(logo, { x: `+=${T.left - D.left - (F.left - D.left) * k}`, y: `+=${T.top - D.top - (F.top - D.top) * k}`, scale: k, duration: 1.3, ease: 'expo.inOut' });
      } else gsap.to(logo, { opacity: 0, scale: 0.9, duration: 0.6 });
      gsap.to(moon, { load: 1, duration: 1.5, ease: 'none' });
      gsap.to(loader, { backgroundColor: 'rgba(236,236,233,0)', duration: 1.1, ease: 'power2.inOut', delay: 0.25 });
      gsap.delayedCall(0.55, intro);
      gsap.delayedCall(1.3, () => {
        gsap.set(navBrand, { opacity: 1 });
        canvas.classList.remove('world--top');
        loader!.remove();
        lenis?.start();
        arrive();
      });
    }
  }

  // ---------- The brief: a sentence you fill in ----------
  const brief = view.querySelector<HTMLFormElement>('[data-brief]');
  if (brief) {
    const errors = brief.querySelector<HTMLElement>('[data-brief-errors]')!;
    const status = brief.querySelector<HTMLElement>('[data-brief-status]')!;
    const field = (nm: string) => brief.elements.namedItem(nm) as HTMLInputElement;
    const check = () => {
      const out: { el: HTMLElement; msg: string }[] = [];
      const name = field('name'), idea = field('idea'), email = field('email');
      const kind = brief.querySelector<HTMLInputElement>('input[name="kind"]:checked');
      if (!name.value.trim()) out.push({ el: name, msg: 'Add your name.' });
      if (!kind) out.push({ el: brief.querySelector<HTMLInputElement>('input[name="kind"]')!, msg: 'Pick what you are building.' });
      if (!idea.value.trim()) out.push({ el: idea, msg: 'Describe it in a line.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) out.push({ el: email, msg: 'Add an email address I can reply to.' });
      [name, idea, email].forEach((i) => i.removeAttribute('aria-invalid'));
      out.forEach((o) => o.el.setAttribute('aria-invalid', 'true'));
      errors.innerHTML = out.map((o) => `<li>${o.msg}</li>`).join('');
      return out;
    };
    scope.on(brief, 'input', () => { if (errors.childElementCount) check(); });
    scope.on(brief, 'submit', async (e) => {
      e.preventDefault();
      const problems = check();
      if (problems.length) { problems[0].el.focus(); return; }
      if (field('company').value) return; // a bot filled the hidden field
      const data = {
        name: field('name').value.trim(),
        kind: brief.querySelector<HTMLInputElement>('input[name="kind"]:checked')!.value,
        idea: field('idea').value.trim(),
        email: field('email').value.trim(),
      };
      const body = `Hi Bharat, I'm ${data.name} and I'm building ${data.kind}. In a line, it's ${data.idea}. You can reach me at ${data.email}.`;
      const endpoint = brief.dataset.endpoint;
      const done = (msg: string) => {
        brief.dataset.sent = 'true';
        status.textContent = msg;
        sound.arpeggio(true);
        if (w && !reduced) gsap.fromTo(moon, { cycle: 0 }, { cycle: 1, duration: 2.4, ease: 'none' });
      };
      if (endpoint) {
        status.textContent = 'Sending…';
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ...data, message: body, subject: `A project for Oblune: ${data.kind}` }),
          });
          if (!res.ok) throw new Error(String(res.status));
          done(`Sent. I’ll reply to ${data.email}.`);
        } catch {
          status.textContent = `That didn’t send. Please write to ${brief.dataset.to} instead.`;
        }
      } else {
        location.href = `mailto:${brief.dataset.to}?subject=${encodeURIComponent(`A project for Oblune: ${data.kind}`)}&body=${encodeURIComponent(body)}`;
        done(`Your mail app should open with this written out. If it didn’t, write to ${brief.dataset.to}.`);
      }
    });
  }

  // ---------- Scroll storytelling in the DOM ----------
  if (!reduced) scope.gsap(() => {
    const statement = view.querySelector<HTMLElement>('[data-brighten]');
    if (statement) {
      SplitText.create(statement, {
        type: 'words',
        autoSplit: true,
        onSplit: (self) =>
          gsap.fromTo(self.words, { opacity: 0.16 }, {
            opacity: 1, ease: 'none', stagger: 0.1,
            scrollTrigger: { trigger: indexSection, start: 'top 75%', end: () => `top+=${innerHeight * 0.2} top`, scrub: true },
          }),
      });
    }
    gsap.from('.index__title', { yPercent: 60, opacity: 0, duration: 1.2, ease: EASE, scrollTrigger: { trigger: indexSection, start: 'top 60%' } });
    gsap.from(indexRows, { opacity: 0, y: 18, duration: 1, ease: EASE, stagger: 0.05, scrollTrigger: { trigger: indexSection, start: 'top 30%' } });
    gsap.from($$('.index__rule'), { scaleX: 0, duration: 1.4, ease: 'expo.inOut', stagger: 0.06, scrollTrigger: { trigger: indexSection, start: 'top 30%' } });

    $$('[data-band]').forEach((band) => {
      const word = band.querySelector<HTMLElement>('[data-band-word]')!;
      gsap.fromTo(word, { clipPath: 'inset(0% 0% 100% 0%)', yPercent: 38 }, {
        clipPath: 'inset(0% 0% -10% 0%)', yPercent: 0, ease: 'expo.out', duration: 1.7,
        scrollTrigger: { trigger: band, start: 'top 72%', once: true },
      });
      gsap.from($$('[data-band-reveal], .band__count', band), { opacity: 0, y: 24, duration: 1.2, ease: EASE, stagger: 0.08, scrollTrigger: { trigger: band, start: 'top 70%' } });
    });

    chapters.forEach((sec) => {
      const name = sec.querySelector<HTMLElement>('[data-chapter-name]')!;
      const split = SplitText.create(name, { type: 'chars', mask: 'chars' });
      gsap.from(split.chars, {
        yPercent: 108, ease: 'expo.out', duration: 1.5, stagger: 0.045,
        scrollTrigger: { trigger: name, start: 'top 88%', once: true },
        onComplete: () => split.revert(),
      });
      gsap.from(sec.querySelectorAll('.chapter__meta > *'), { opacity: 0, duration: 1.2, ease: 'power2.out', stagger: 0.07, scrollTrigger: { trigger: sec, start: 'top 72%' } });
      gsap.from(sec.querySelectorAll('.chapter__line, .chapter__about'), { opacity: 0, y: 22, duration: 1.2, ease: EASE, stagger: 0.07, scrollTrigger: { trigger: sec, start: 'top 72%' } });
      const disc = sec.querySelector('[data-disc]');
      gsap.fromTo(disc, { scale: 0.72, rotate: -40, opacity: 0 }, {
        scale: 1, rotate: 0, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: sec.querySelector('.chapter__body'), start: 'top bottom', end: 'top 30%', scrub: true },
      });
    });

    $$('#practice, #contact').forEach((section) => {
      const els = $$('[data-reveal]', section);
      gsap.from(els, {
        opacity: 0, y: (i: number) => (els[i].querySelector('[data-line-step]') ? 0 : 28), duration: 1.2, ease: EASE, stagger: 0.08,
        scrollTrigger: { trigger: section.id === 'contact' ? section.querySelector('.contact__night') : section, start: 'top 75%' },
      });
    });
    gsap.from('.practice__moon', {
      scale: 0.8, rotate: -30, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.practice__body', start: 'top bottom', end: 'top 35%', scrub: true },
    });
    const whisper = $('[data-whisper]');
    const wsplit = SplitText.create(whisper, { type: 'lines', mask: 'lines' });
    gsap.from(wsplit.lines, { yPercent: 110, duration: 1.4, ease: EASE, stagger: 0.1, scrollTrigger: { trigger: whisper, start: 'top 80%' } });
  });
  if (!reduced) {
    if (lenis) skewOnScroll(velocity, scope, view);
    marquee(velocity, scope, view);
    if (!coarse) chromeMark(scope);
  }

  // ---------- Where in-page links land ----------
  function target(hash: string): { el: Element; offset?: number; label?: string } | null {
    if (hash === '#top' || hash === '#') return { el: document.body, offset: 0 };
    let el: HTMLElement | null = null;
    try { el = view.querySelector<HTMLElement>(hash); } catch { return null; }
    if (!el) return null;
    if (hash === '#contact') return { el, offset: innerHeight * 1.05 };
    if (hash === '#work') return { el, offset: 0 };
    // sections open with a lot of air; land where their first line sits below the nav
    const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
    return { el, offset: Math.max(0, pad - 110) };
  }
  const targetY = (h: string) => { const t = target(h); return t ? Math.max(0, t.el.getBoundingClientRect().top + scrollY + (t.offset ?? 0)) : 0; };

  // ---------- Layout changes rebuild the line ----------
  let rt = 0;
  const rebuild = () => { if (scope.dead) return; ScrollTrigger.refresh(); buildLine(); chrome.sizeIsland(); };
  scope.on(window, 'resize', () => { clearTimeout(rt); rt = window.setTimeout(rebuild, 200); });
  document.fonts?.ready.then(rebuild);
  scope.on(window, 'load', rebuild);
  scope.observe(new ResizeObserver(() => { clearTimeout(rt); rt = window.setTimeout(rebuild, 200); })).observe(view);
  scope.add(() => clearTimeout(rt));

  return {
    target,
    intro: () => { if (!first) { intro(); } },
    destroy() {
      if (w) {
        w.hooks.length = 0;
        w.emblemState.alpha = 0;
        w.releaseChapters();
        canvas.hidden = true;
        canvas.classList.remove('world--top');
      }
      if (line) line.geometry.setDrawRange(0, 0);
      if (bead) bead.mesh.visible = false;
      document.documentElement.classList.remove('is-ready');
      sound.night(0);
    },
  };
}
