import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { getWorld, prepareWorld, RibbonDriver, pageBox, textBox } from '../lib/world/stage';
import { EMBLEM_FILL } from '../lib/world/Moon';
import { orbit, type RibbonPoint } from '../lib/world/Ribbon';
import { emblemPath } from '../lib/phase';
import { phaseName } from '../lib/moonphase';
import { sound } from '../lib/audio';
import { app, type PageCtx, type PageHandle } from '../lib/app';
import { enter } from '../lib/enter';
import { kinetic, skewOnScroll, tonight, chromeMark, marquee, riseWords, resizeFilter } from '../lib/fx';
import { strings } from '../lib/strings';

const EASE = 'expo.out';
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (from: number, to: number, l: number, dt: number) => from + (to - from) * (1 - Math.exp(-l * dt));
const TAU = Math.PI * 2;
const mobileQ = matchMedia('(max-width: 860px)');

/** The stage is built before the page mounts, a step per task. */
export const prepare = prepareWorld;

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
    w.invalidate();
    // back from a case page: the ribbon takes its home thickness and colour again
    w.ribbon.setRadius(mobileQ.matches ? 8 : 13);
    w.ribbon.setTail(0);
    w.ribbon.opacity = 1;
    w.ribbon.setNight(0);
  }

  const anchors = {
    hero: $('[data-moon-anchor="hero"]'),
    dusk: $('[data-moon-anchor="dusk"]'),
    footer: $('[data-moon-anchor="footer"]'),
  };
  const work = $('[data-work]');
  const studio = $('[data-studio]');
  const dusk = $('[data-dusk]');
  const duskWords = $('.dusk__words');
  const contact = $('#contact');

  type R = { x: number; y: number; w: number };
  /** The square the moon is drawn in, for a slot element (its radius is half the slot's width). */
  const rectOf = (el: Element): R | null => {
    const r = el.getBoundingClientRect();
    if (r.width < 2) return null;
    const d = Math.min(r.width, r.height) / EMBLEM_FILL;
    return { x: r.left + r.width / 2 - d / 2, y: r.top + r.height / 2 - d / 2, w: d };
  };
  const around = (x: number, y: number, radius: number): R => { const d = (radius * 2) / EMBLEM_FILL; return { x: x - d / 2, y: y - d / 2, w: d }; };
  const mix = (a: R, b: R, t: number): R => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t) });

  const moon = {
    load: reduced || quick ? 1 : 0,
    turn: 0,
    spinV: 0,
    cycle: 0,
    tilt: { x: 0, y: 0 },
    light: { x: 0, y: 0 },
  };
  const moonAlpha = { v: reduced ? 1 : 0 };
  /** The contact moon's phase: it waxes with every part of the letter you complete. */
  const briefLit = { v: 0.3 };
  const duskPctEl = $('[data-dusk-pct]');
  let duskShown = -1;
  let night = 0;
  // The work is a night of its own. Night rises from below the screen as a disc, slowly and then all
  // at once, until it has taken the whole screen; the hero recedes as it comes. For the studio the day
  // rises inside it the same way, and the work recedes. Both follow the scroll on a spring.
  const navEl = document.querySelector<HTMLElement>('[data-nav]');
  const heroGrid = $('.hero__grid');
  const workHead = $('.work__head'), studioTop = $('.studio__top');
  const metaEls = $$('.card__meta');
  const arrived = { work: -1, studio: -1, dusk: -1 };
  let headRecede = -1;
  /** How far a box is inside a disc rising from (cx, cy): 1 once its farthest corner is well in. */
  const inside = (el: Element, cx: number, cy: number, r: number) => {
    const b = el.getBoundingClientRect();
    const d = Math.hypot(Math.max(Math.abs(b.left - cx), Math.abs(b.right - cx)), cy - b.top) - r;
    return Math.round(smooth(0, -80, d) * 100) / 100;
  };
  const take = { in: 0, out: 0, dusk: 0 };
  const recede = { hero: -1, work: -1, studio: -1 };
  scope.add(() => { if (navEl) delete navEl.dataset.tone; w?.ribbon.setDiscs([0, 0, 0], [0, 0, 0], [0, 0, 0]); w?.night.set(1, 1, [0, 0, 0], [0, 0, 0], [0, 0, 0], 0); w?.invalidate(); });

  // ---------- The hero moon: drag it through a month, or press it to play one ----------
  // Its phase is an angle round the month: 0 new, PI full, past PI waning (drawn mirrored). At rest it
  // is the logo's waxing gibbous, and it eases back there a moment after you let go.
  const HOME = Math.acos(1 - 2 * 0.75);
  const phase = { theta: HOME, v: 0, held: false, idle: 0, eighth: 0 };
  const litOf = (th: number) => (1 - Math.cos(th)) / 2;
  const waningOf = (th: number) => Math.sin(th) < 0;
  const homeFor = (th: number) => HOME + Math.round((th - HOME) / TAU) * TAU;
  const heroMoon = anchors.hero;
  const phaseText = $('[data-hero-phase]');
  const phaseHint = phaseText.textContent!;
  let shownPhase = '';
  let dragX = 0, dragMoved = 0, lastDragT = 0;
  const touched = () => { phase.idle = 0; document.documentElement.dataset.moonTouched = ''; };
  if (w && !reduced) {
    // the fallback picture inside it would start a native image drag (and cancel the pointer)
    scope.on(heroMoon, 'dragstart', (e) => e.preventDefault());
    scope.on(heroMoon, 'pointerdown', (e) => {
      phase.held = true; dragX = e.clientX; dragMoved = 0; lastDragT = performance.now();
      gsap.killTweensOf(phase);
      heroMoon.setPointerCapture(e.pointerId);
      touched();
    });
    scope.on(heroMoon, 'pointermove', (e) => {
      if (!phase.held) return;
      const dx = e.clientX - dragX, now = performance.now();
      dragX = e.clientX; dragMoved += Math.abs(dx);
      // the moon's width is half a month
      const d = (dx / heroMoon.getBoundingClientRect().width) * Math.PI;
      phase.theta += d;
      phase.v = lerp(phase.v, d / Math.max(0.008, (now - lastDragT) / 1000), 0.5);
      lastDragT = now;
      phase.idle = 0;
    });
    const release = () => {
      if (!phase.held) return;
      phase.held = false;
      if (performance.now() - lastDragT > 90) phase.v = 0;
      if (Math.abs(phase.v) > 9) sound.whoosh(phase.v > 0);
    };
    scope.on(heroMoon, 'pointerup', release);
    scope.on(heroMoon, 'pointercancel', release);
    scope.on(heroMoon, 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
      e.preventDefault();
      touched();
      phase.v = 0;
      gsap.to(phase, { theta: phase.theta + (k === 'ArrowRight' ? 1 : -1) * (TAU / 8), duration: 0.6, ease: 'power3.out', overwrite: true });
    });
  }
  scope.on(heroMoon, 'click', (e) => {
    if (dragMoved > 6) { dragMoved = 0; e.preventDefault(); return; }
    sound.arpeggio(true);
    if (reduced || !w) return;
    touched();
    phase.v = 0;
    gsap.to(phase, { theta: homeFor(phase.theta) + TAU, duration: 2.8, ease: 'power2.inOut', overwrite: true });
  });
  // the contact moon plays its phases when pressed
  $$('#contact [data-moon-cycle]').forEach((b) => scope.on(b, 'click', () => {
    sound.arpeggio(true);
    if (reduced || !w) return;
    gsap.fromTo(moon, { cycle: 0 }, { cycle: 1, duration: 2.4, ease: 'none' });
    moon.spinV += 14;
  }));

  /** Each frame: the hero moon's phase coasts, settles home when left alone, and says what it is. */
  function phaseFrame(dt: number, away: boolean) {
    const tweening = gsap.isTweening(phase);
    if (!phase.held && !tweening) {
      phase.theta += phase.v * dt;
      phase.v *= Math.exp(-2.6 * dt);
      if (Math.abs(phase.v) < 0.3) {
        phase.idle += dt;
        // a moment after you let go (at once, if you have scrolled on), it eases back to the logo
        if (phase.idle > 1.6 || away) { phase.theta = damp(phase.theta, homeFor(phase.theta), away ? 6 : 2.4, dt); phase.v = damp(phase.v, 0, 4, dt); }
      }
    }
    // a soft tick as it passes each eighth of the month
    const eighth = Math.floor(phase.theta / (TAU / 8));
    if (eighth !== phase.eighth) {
      if ((phase.held || tweening || Math.abs(phase.v) > 0.3) && !away) sound.chime(((eighth % 8) + 8) % 8, 0.22);
      phase.eighth = eighth;
    }
    const resting = !phase.held && !tweening && Math.abs(phase.theta - homeFor(phase.theta)) < 0.01;
    let text = phaseHint;
    if (!resting) {
      const pct = Math.round(litOf(phase.theta) * 100);
      const name = phaseName(pct, !waningOf(phase.theta)).replace(/^(a|the) /, '');
      text = `${name[0].toUpperCase()}${name.slice(1)} · ${pct}%`;
    }
    if (text !== shownPhase) { shownPhase = text; phaseText.textContent = text; }
  }

  // ---------- The work: covers drawn on the stage ----------
  const cardEls = $$('[data-card]');
  const media = $$('[data-card-media]');
  if (w) {
    w.cards.bind(media);
    $$('[data-card-link]').forEach((a, i) => {
      scope.on(a, 'pointerenter', () => { w.cards.hover(i, true); sound.chime(i, 0.35); });
      scope.on(a, 'pointerleave', () => w.cards.hover(i, false));
      scope.on(a, 'focus', () => w.cards.hover(i, true));
      scope.on(a, 'blur', () => w.cards.hover(i, false));
    });
  }

  // ---------- The ribbon: the moon's orbit, carried on through the page ----------
  const driver = w ? new RibbonDriver(w, { coarse, reduced }) : null;
  if (driver) driver.intro.v = reduced || quick ? 1 : 0;
  const page = pageBox;

  // The ribbon keeps to margins and gutters, passes over pictures rather than words, and wraps the
  // headings instead of cutting through them. It begins orbiting the hero moon and ends orbiting the
  // contact moon: the same gesture, at both ends of the page.
  function route(): RibbonPoint[] {
    const vw = innerWidth, vh = innerHeight;
    const pts: RibbonPoint[] = [];
    const hm = page(anchors.hero);
    const R = hm.w / 2;
    const mobile = mobileQ.matches;
    const F = page(anchors.footer);
    const FR = F.w / 2;
    const D = textBox(duskWords);
    // the end: down onto the contact moon from the upper left, behind it across the top, round the
    // right, in front along the bottom, and it stops there
    const finale = () => {
      orbit(pts, { x: F.cx, y: F.cy }, FR * 1.62, FR * 0.4, -0.42, -0.82 * Math.PI, 0.78 * Math.PI, FR * 1.3, FR * 2.2, 0, 56);
    };

    // 1. from the right, behind the hero moon across the top, round the left, in front along the bottom, away right
    orbit(pts, { x: hm.cx, y: hm.cy }, R * (mobile ? 1.36 : 1.55), R * 0.44, -0.42, -0.2 * Math.PI, -1.56 * Math.PI, R * 1.3, R * 2.6, R * 0.5, 48);
    pts.push({ x: hm.cx + R * 1.75, y: hm.cy + R * 0.18, z: 30 }, { x: hm.cx + R * 2.3, y: hm.cy + R * 0.5, z: 0 }, { x: vw + 200, y: hm.cy + R * 1.4, z: 0 });
    // the dusk: round the waxing moon under the words, the same orbit as at both ends of the page,
    // and away down the right side
    const M = page(anchors.dusk);
    const mr = M.w / 2;
    // in from the upper right, down its right side, in front along its bottom, and away to the left
    const duskOrbit = () => orbit(pts, { x: M.cx, y: M.cy }, mr * 1.7, mr * 0.42, -0.42, -0.08 * Math.PI, 0.64 * Math.PI, mr * 1.3, 0, mr * 1.2, 44);
    if (mobile) {
      // phones have no margins to spare: off the right edge, back in round the dusk moon, and down to the contact moon
      pts.push({ x: vw + 120, y: D.t - vh * 0.6, z: -60 }, { x: vw + 40, y: M.t - vh * 0.05, z: -60 });
      duskOrbit();
      pts.push({ x: 10, y: M.b + vh * 0.25, z: -40 });
      finale();
      return pts;
    }
    // 2. into the night of the work: back in from the right under the lede, and down the gutter
    //    between the two columns, swaying a little but never under a cover, then out to the right
    // the title's words may still be mid-reveal (shifted down) when this is measured: its height comes
    // from its box, its right end from the words
    const S = { ...pageBox($('.studio__title')), r: textBox($('.studio__title')).r };
    const lede = page($('.work__lede'));
    const m0 = page(cardEls[0].querySelector('.card__media')!), m1 = page(cardEls[1].querySelector('.card__media')!);
    const gx = (m0.r + m1.l) / 2, sway = (m1.l - m0.r) * 0.16;
    const last = page(cardEls[cardEls.length - 1].querySelector('.card__media')!);
    pts.push({ x: vw + 160, y: lede.t - vh * 0.1, z: 0 }, { x: lede.l + lede.w * 0.55, y: lede.b + vh * 0.04, z: 20 });
    pts.push({ x: gx, y: m0.t + m0.h * 0.1, z: 20 });
    const runs = Math.max(2, Math.round((last.b - m0.t) / (vh * 0.45)));
    for (let i = 1; i <= runs; i++) pts.push({ x: gx + Math.sin(i * 1.7) * sway, y: m0.t + m0.h * 0.1 + ((last.b - m0.t - m0.h * 0.1) * i) / runs, z: 20 });
    pts.push({ x: gx, y: page(cardEls[cardEls.length - 1]).b + 30, z: 20 }, { x: vw * 0.78, y: page(cardEls[cardEls.length - 1]).b + vh * 0.12, z: 20 }, { x: vw + 120, y: S.t - vh * 0.25, z: 0 });
    // 3. to the studio: one wide curve round the right of "One person, the whole product.", back under
    //    it through the white between the title and the disciplines, and down between bio and list
    const bio = page($('.studio__bio')), list = page($('.studio__list'));
    const gap = (bio.r + list.l) / 2;
    const room = vw - S.r, under = (S.b + list.t) / 2;
    pts.push({ x: Math.min(vw - 60, S.r + room * 0.78), y: S.t + S.h * 0.45, z: 40 });
    pts.push({ x: S.r + room * 0.32, y: under, z: 20 }, { x: gap + 70, y: under + 6, z: 0 });
    // 4. down the gap between the bio and the disciplines, under the list, then the right margin
    pts.push({ x: gap, y: list.t + 70, z: -40 }, { x: gap, y: Math.max(bio.b, list.b) - 10, z: -80 });
    const facts = page($('.studio__facts'));
    pts.push({ x: vw - 14, y: facts.t - 20, z: -80 }, { x: vw - 12, y: facts.b + 40, z: -80 });
    // 5. down the right margin and round the dusk moon as it waxes
    pts.push({ x: vw - 18, y: M.t - vh * 0.05, z: -40 });
    duskOrbit();
    // 6. down the left margin to the contact moon
    const lead = page($('.contact__lead'));
    pts.push({ x: 14, y: lead.t + 20, z: -60 });
    finale();
    return pts;
  }

  function buildRibbon() {
    if (!w || !driver) return;
    w.ribbon.setNight(0);
    driver.build(route());
  }

  // ---------- Each frame ----------
  const loaderSlot = view.querySelector('[data-loader-slot]') as SVGCircleElement | null;
  let loaderFrozen: R | null = null;
  const loaderRectNow = () => { const lr = loaderSlot!.getBoundingClientRect(); return around(lr.left + lr.width / 2, lr.top + lr.height / 2, lr.width / 2); };
  let lastScene = '';
  let lastNow = '';

  function frameHook(t: number, dt: number) {
    const wd = w!;
    const vh = wd.vh, vw = wd.vw;
    const ms = wd.moonState;

    driver!.frame(t, dt);

    const dkr = dusk.getBoundingClientRect();
    const cr = contact.getBoundingClientRect();
    const wr = work.getBoundingClientRect(), sr = studio.getBoundingClientRect();

    // --- night and day as discs rising from below: the work's night, the studio's day inside it, and
    //     the dusk's night, which keeps the screen to the end. Each follows the scroll on a spring,
    //     quadratic, so it gathers pace and takes over. ---
    const to = (top: number) => clamp((vh - top) / (vh * 0.65));
    const k = reduced ? 1 : 1 - Math.exp(-9 * dt);
    take.in += (to(wr.top) - take.in) * k;
    take.out += (to(sr.top) - take.out) * k;
    take.dusk += (to(dkr.top) - take.dusk) * k;
    const cx = vw / 2, cy = vh * 1.15, R = Math.hypot(vw / 2, cy) + 40;
    const nr = R * take.in ** 2, yr = R * take.out ** 2, kr = R * take.dusk ** 2;
    if (wd.night.set(vw, vh, [cx, cy, nr], [cx, cy, yr], [cx, cy, kr], scrollY)) wd.invalidate();
    wd.ribbon.setDiscs([cx, cy + scrollY, nr], [cx, cy + scrollY, yr], [cx, cy + scrollY, kr]);
    // what a night takes, fades: the hero's words as the work's night comes, the work's as the day
    // comes back, the studio's as the dusk comes
    const q = (v: number) => Math.round(v * 100) / 100;
    const ri = q(smooth(0.3, 0.75, take.in)), ro = q(smooth(0.35, 0.76, take.out)), rs = q(smooth(0.35, 0.76, take.dusk));
    // (opacity is written on the words themselves: a custom property on a section would restyle
    // every element inside it, each frame it changes)
    const fade = (el: HTMLElement, v: number) => { el.style.opacity = v === 1 ? '' : String(Math.round(v * 100) / 100); };
    if (ri !== recede.hero) { recede.hero = ri; fade(heroGrid, 1 - ri); }
    if (ro !== recede.work) { recede.work = ro; metaEls.forEach((m) => fade(m, 1 - ro)); }
    if (rs !== recede.studio) { recede.studio = rs; fade(studio, 1 - rs); }
    // and what each sky brings arrives only once it is wholly inside it: light words on the night,
    // dark words on the day, never across the edge
    const aw = reduced ? 1 : inside(workHead, cx, cy, nr), as = reduced ? 1 : inside(studioTop, cx, cy, yr), ad = reduced ? 1 : inside(duskWords, cx, cy, kr);
    if (aw !== arrived.work || ro !== headRecede) { arrived.work = aw; headRecede = ro; fade(workHead, (1 - ro) * aw); }
    if (as !== arrived.studio) { arrived.studio = as; fade(studioTop, as); }
    if (ad !== arrived.dusk) { arrived.dusk = ad; fade(duskWords, ad); }
    if (navEl) {
      const d = cy - 38;
      const tone = (d < nr && d >= yr) || d < kr ? 'night' : '';
      if ((navEl.dataset.tone ?? '') !== tone) { if (tone) navEl.dataset.tone = tone; else delete navEl.dataset.tone; }
    }
    // the rest of the page (the letter, the sound, the moon's glow) follows the dusk's night
    night = take.dusk;
    const isNight = night > 0.98;
    if ((document.documentElement.dataset.night === 'true') !== isNight) document.documentElement.dataset.night = String(isNight);
    sound.night(night);

    // --- the project nearest the middle of the screen (the island names it) ---
    let best = 0, bd = 1e9;
    cardEls.forEach((c, i) => { const r = c.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - vh * 0.5); if (d < bd) { bd = d; best = i; } });

    // --- where the moon is: the hero, the dusk, and the letter ---
    const hero = rectOf(anchors.hero), ft = rectOf(anchors.footer), dk = rectOf(anchors.dusk);
    const heroUp = !!hero && hero.y + hero.w > -10;
    phaseFrame(dt, !heroUp || scrollY > vh * 0.4);
    const heroLit = litOf(phase.theta), heroWane = waningOf(phase.theta);
    let rect: R = { x: -9999, y: -9999, w: 10 }, lit = 0.75, wane = false, alpha = 1, shadow = 1, scale = 1;
    if (moon.load < 1) {
      rect = mix(loaderFrozen ?? loaderRectNow(), hero ?? loaderRectNow(), ease(moon.load));
      shadow = moon.load;
    } else if (heroUp) {
      rect = hero!; lit = heroLit; wane = heroWane;
    } else if (dk && dk.y < vh && dk.y + dk.w > 0) {
      // the dusk moon waxes from a sliver to full as it rises up the screen
      rect = dk;
      const p = smooth(vh * 0.95, vh * 0.4, dk.y + dk.w / 2);
      lit = lerp(0.04, 1, p);
      const pct = Math.round(lit * 100);
      if (pct !== duskShown) { duskShown = pct; duskPctEl.textContent = String(pct); }
    } else if (ft && ft.y < vh && ft.y + ft.w > 0) {
      // the contact moon: it waxes as the letter is written
      rect = ft; lit = briefLit.v;
      alpha = smooth(0.1, 0.5, (vh - cr.top) / vh);
    } else alpha = 0;

    if (moon.cycle > 0 && moon.cycle < 1) {
      const c = moon.cycle;
      lit = c < 0.3 ? lerp(lit, 0, ease(c / 0.3)) : c < 0.8 ? lerp(0, 1, ease((c - 0.3) / 0.5)) : lerp(1, lit, ease((c - 0.8) / 0.2));
    }

    // a spin it is given (the contact moon, a sent letter) keeps going, slows, and settles face on
    moon.spinV *= Math.exp(-1.9 * dt);
    moon.turn += moon.spinV * dt;
    if (Math.abs(moon.spinV) < 2.2 && !gsap.isTweening(moon)) {
      const home = Math.round(moon.turn / TAU) * TAU;
      moon.turn = damp(moon.turn, home, 3.4, dt);
      moon.spinV = damp(moon.spinV, 0, 3.4, dt);
    }
    const p = wd.pointer;
    const still = coarse || reduced;
    const lean = Math.max(-0.5, Math.min(0.5, phase.v * 0.05));
    moon.tilt.x = damp(moon.tilt.x, (still ? 0 : p.x * 0.36) + lean, 3.2, dt);
    moon.tilt.y = damp(moon.tilt.y, still ? 0 : p.y * 0.24, 3.2, dt);
    moon.light.x = damp(moon.light.x, coarse || reduced ? Math.sin(t * 0.25) * 0.4 : p.x * 0.6, 2, dt);
    moon.light.y = damp(moon.light.y, coarse || reduced ? 0 : -p.y * 0.4, 2, dt);
    wd.cards.pointer(p.x, p.y);

    ms.rect = rect;
    ms.lit = lit;
    ms.wane = wane;
    ms.tilt = { x: moon.tilt.x + moon.turn, y: moon.tilt.y };
    ms.light = moon.light;
    ms.alpha = moonAlpha.v * alpha;
    ms.scale = scale;
    ms.shadow = shadow;
    ms.night = Math.max(night, take.in * (1 - take.out));

    // --- where you are: the island says it, and offers the way into the case study in view ---
    let scene = 'hero', now = 'Oblune Studio', go: { href: string; label: string } | null = null, nowLit = 0.75;
    if (dkr.top < vh * 0.3 || cr.top < vh * 0.5) { scene = 'night'; now = 'Work with me'; nowLit = 1; }
    else if (sr.top < vh * 0.5) { scene = 'practice'; now = 'Studio'; nowLit = 1; }
    else if (wr.top < vh * 0.5) {
      const c = cardEls[best];
      scene = c.id; now = c.querySelector('.card__name')!.textContent!.trim();
      go = { href: `/work/${c.id}`, label: 'Case study' };
    }
    if (now !== lastNow) { lastNow = now; chrome.setNow(now, nowLit, go); }
    if (scene !== lastScene) { lastScene = scene; sound.scene(scene); }
  }

  if (w) {
    w.hooks.length = 0;
    w.hooks.push(frameHook);
    scope.tick((_, delta) => { if (!app.paused) w.frame(Math.min(delta / 1000, 1 / 20)); });
  }

  // ---------- Loader ----------
  const loader = view.querySelector<HTMLElement>('[data-loader]');
  const navBrand = document.querySelector<HTMLElement>('[data-nav-brand]')!;
  const island = chrome.island;
  let entered = false;

  function arrive() {
    try { sessionStorage.setItem('oblune:seen', '1'); } catch { /* private mode */ }
    const h = decodeURIComponent(location.hash);
    if (first && h.startsWith('#code/')) app.repos.fromHash();
    else if (first && h.length > 1) requestAnimationFrame(() => { ScrollTrigger.refresh(); const y = targetY(h); if (y) lenis?.scrollTo(y, { immediate: true, force: true }); });
  }

  const words = $$('[data-words]');
  function intro() {
    document.documentElement.classList.add('is-ready');
    chrome.sizeIsland();
    if (reduced) { gsap.set(navBrand, { opacity: 1 }); if (driver) driver.intro.v = 1; return; }
    scope.gsap(() => {
      gsap.fromTo(moon, { turn: -TAU * 0.5 }, { turn: 0, duration: 2.4, ease: 'expo.out' });
      // the ribbon draws itself round the moon as the page arrives
      if (driver) gsap.fromTo(driver.intro, { v: 0 }, { v: 1, duration: 2.8, ease: 'power2.inOut', delay: 0.15 });
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
    loader?.remove();
    canvas.classList.remove('world--top');
    view.querySelector('main')?.removeAttribute('aria-busy');
    if (reduced) moonAlpha.v = 1;
    if (w) w.warm().then(readyMoon); else readyMoon();
    if (!first) gsap.set(navBrand, { opacity: 1 });
    if (first) { intro(); arrive(); }
    else { document.documentElement.classList.add('is-ready'); if (driver) driver.intro.v = 1; }
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
    if (w) tasks.push(w.warm().then(() => { target += 0.35; })); else target += 0.35;
    const firstCover = media[0]?.querySelector('img');
    tasks.push((firstCover?.decode?.() ?? Promise.resolve()).catch(() => {}).then(() => (target += 0.4)));
    const tickLoader = () => {
      shown.v += (Math.min(target, 1) - shown.v) * 0.06;
      const v = shown.v;
      ringEl.style.strokeDashoffset = String(-v * 0.25);
      loaderMoon.setAttribute('d', emblemPath(v * 0.75));
      count.textContent = String(Math.round(v * 100)).padStart(3, '0');
    };
    gsap.ticker.add(tickLoader);
    scope.add(() => gsap.ticker.remove(tickLoader));
    const minTime = new Promise((r) => setTimeout(r, 1600));
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
      loaderMoon.setAttribute('d', emblemPath(0.75));
      if (w) { moonAlpha.v = 1; gsap.to(loaderMoon, { opacity: 0, duration: 0.5, ease: 'power2.out' }); }
      gsap.timeline()
        .to(logo, { translate: '0% 0', duration: 1, ease: 'expo.inOut' }, 0.2)
        .to(clipRect, { attr: { width: 270 }, duration: 1, ease: 'expo.inOut' }, 0.25)
        .to('.loader__count', { opacity: 0, duration: 0.4 }, 0.6)
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

  // ---------- The brief: a letter you fill in; the moon waxes as you write it ----------
  const brief = view.querySelector<HTMLFormElement>('[data-brief]');
  if (brief) {
    const errors = brief.querySelector<HTMLElement>('[data-brief-errors]')!;
    const status = brief.querySelector<HTMLElement>('[data-brief-status]')!;
    const countEl = view.querySelector<HTMLElement>('[data-brief-count]')!;
    const pctEl = view.querySelector<HTMLElement>('[data-brief-pct]')!;
    const capEl = view.querySelector<HTMLElement>('[data-brief-cap]')!;
    const field = (nm: string) => brief.elements.namedItem(nm) as HTMLInputElement;
    const picked = (nm: string) => brief.querySelector<HTMLInputElement>(`input[name="${nm}"]:checked`);
    const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
    const CAPS = [
      'A crescent. Start with your name.',
      'Waxing. What are you building?',
      'Nearly half. Tell me the idea in a line.',
      'More than half. When would you like to start?',
      'Nearly full. Where can I reply?',
      'A full moon. Send it whenever you are ready.',
    ];
    const pctShown = { v: 0 };
    let doneBefore = -1;
    const progress = () => {
      const done = [field('name').value.trim(), picked('kind'), field('idea').value.trim(), picked('when'), emailOk(field('email').value)].filter(Boolean).length;
      if (done === doneBefore) return;
      const up = done > doneBefore && doneBefore >= 0;
      doneBefore = done;
      countEl.textContent = String(done);
      capEl.textContent = CAPS[done];
      const to = done / 5;
      gsap.to(briefLit, { v: 0.3 + to * 0.7, duration: 1.1, ease: 'power3.inOut', overwrite: true });
      gsap.to(pctShown, { v: to * 100, duration: 0.9, ease: 'power3.out', overwrite: true, onUpdate: () => { pctEl.textContent = String(Math.round(pctShown.v)); } });
      if (up) { sound.chime(done, 0.5); if (done === 5) setTimeout(() => sound.arpeggio(true), 200); }
    };
    const check = () => {
      const out: { el: HTMLElement; msg: string }[] = [];
      const name = field('name'), idea = field('idea'), email = field('email');
      if (!name.value.trim()) out.push({ el: name, msg: 'Add your name.' });
      if (!picked('kind')) out.push({ el: brief.querySelector<HTMLInputElement>('input[name="kind"]')!, msg: 'Pick what you are building.' });
      if (!idea.value.trim()) out.push({ el: idea, msg: 'Describe it in a line.' });
      if (!picked('when')) out.push({ el: brief.querySelector<HTMLInputElement>('input[name="when"]')!, msg: 'Pick when you would like to start.' });
      if (!emailOk(email.value)) out.push({ el: email, msg: 'Add an email address I can reply to.' });
      [name, idea, email].forEach((i) => i.removeAttribute('aria-invalid'));
      out.forEach((o) => o.el.setAttribute('aria-invalid', 'true'));
      errors.innerHTML = out.map((o) => `<li>${o.msg}</li>`).join('');
      return out;
    };
    scope.on(brief, 'input', () => { progress(); if (errors.childElementCount) check(); });
    scope.on(brief, 'change', progress);
    progress();
    scope.on(brief, 'submit', async (e) => {
      e.preventDefault();
      const problems = check();
      if (problems.length) { problems[0].el.focus(); return; }
      if (field('company').value) return; // a bot filled the hidden field
      const data = {
        name: field('name').value.trim(),
        kind: picked('kind')!.value,
        idea: field('idea').value.trim(),
        when: picked('when')!.value,
        email: field('email').value.trim(),
      };
      const body = `Hi Bharat, I'm ${data.name}, and I'm building ${data.kind}. In a line, it's ${data.idea}. I'd like to start ${data.when}. You can reach me at ${data.email}.`;
      const endpoint = brief.dataset.endpoint;
      const done = (msg: string) => {
        brief.dataset.sent = 'true';
        status.textContent = msg;
        capEl.textContent = 'Sent. The moon is yours.';
        sound.arpeggio(true);
        if (w && !reduced) { gsap.fromTo(moon, { cycle: 0 }, { cycle: 1, duration: 2.4, ease: 'none' }); moon.spinV += 10; }
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
        done(`Your mail app should open with the letter written out. If it didn’t, write to ${brief.dataset.to}.`);
      }
    });
  }

  // ---------- Words and reveals ----------
  // all below the first screen: split and armed in a task of their own, after the page is up
  const later = (fn: () => void) => { const id = window.setTimeout(() => { if (!scope.dead) fn(); }, 0); scope.add(() => clearTimeout(id)); };
  if (!reduced) later(() => scope.gsap(() => {
    words.forEach((el) => riseWords(el));
    cardEls.forEach((c) => {
      gsap.from(c.querySelectorAll('.card__meta > *'), { opacity: 0, y: 18, duration: 1.1, ease: EASE, stagger: 0.06, scrollTrigger: { trigger: c.querySelector('.card__meta'), start: 'top 94%', once: true } });
    });
    $$('#studio [data-reveal], #contact [data-reveal]').forEach((el) => gsap.from(el, { opacity: 0, y: 28, duration: 1.2, ease: EASE, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));
    gsap.from('.studio__fact-v', { yPercent: 60, opacity: 0, duration: 1.3, ease: EASE, stagger: 0.08, scrollTrigger: { trigger: '.studio__facts', start: 'top 85%', once: true } });
  }));
  if (!reduced) {
    if (lenis) skewOnScroll(velocity, scope, view);
    marquee(velocity, scope, view);
    if (!coarse) chromeMark(scope);
  }
  strings(view, scope, { reduced, coarse });

  // ---------- Where in-page links land ----------
  function target(hash: string): { el: Element; offset?: number; label?: string } | null {
    if (hash === '#top' || hash === '#') return { el: document.body, offset: 0 };
    let el: HTMLElement | null = null;
    try { el = view.querySelector<HTMLElement>(hash); } catch { return null; }
    if (!el) return null;
    if (el.matches('[data-card]')) return { el, offset: -Math.max(96, (innerHeight - el.getBoundingClientRect().height) / 2) };
    if (hash === '#contact') return { el, offset: 0 };
    const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
    return { el, offset: Math.max(0, pad - 110) };
  }
  const targetY = (h: string) => { const t = target(h); return t ? Math.max(0, t.el.getBoundingClientRect().top + scrollY + (t.offset ?? 0)) : 0; };

  // ---------- Layout changes: measure the covers again, and lay the ribbon again ----------
  let rt = 0;
  const rebuild = () => { if (scope.dead) return; ScrollTrigger.refresh(); chrome.sizeIsland(); w?.cards.layout(); buildRibbon(); w?.invalidate(); };
  const resized = resizeFilter(coarse);
  scope.on(window, 'resize', () => { if (!resized()) return; clearTimeout(rt); rt = window.setTimeout(rebuild, 200); });
  document.fonts?.ready.then(rebuild);
  scope.on(window, 'load', rebuild);
  scope.observe(new ResizeObserver(() => { clearTimeout(rt); rt = window.setTimeout(rebuild, 200); })).observe(view);
  scope.add(() => clearTimeout(rt));
  // the ribbon is laid in a task of its own too (it is drawn on after the loader in any case)
  later(() => buildRibbon());

  return {
    target,
    intro: () => { if (!first) intro(); },
    destroy() {
      if (w) {
        w.hooks.length = 0;
        w.moonState.alpha = 0;
        w.cards.release();
        w.ribbon.setHead(0);
        w.invalidate();
        w.frame(0);
        canvas.hidden = true;
        canvas.classList.remove('world--top');
      }
      document.documentElement.classList.remove('is-ready');
      sound.night(0);
    },
  };
}
