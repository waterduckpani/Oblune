import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { sound } from '../lib/audio';
import { app, type PageCtx, type PageHandle } from '../lib/app';
import type { Go } from '../lib/chrome';
import { getWorld, prepareWorld, RibbonDriver, pageBox, textBox } from '../lib/world/stage';
import { ScrollTrigger as ST } from 'gsap/ScrollTrigger';
import { resizeFilter } from '../lib/fx';

const EASE = 'expo.out';

/** The stage is built before the page mounts, a step per task. */
export const prepare = prepareWorld;

export function mount({ scope, view, first }: PageCtx): PageHandle {
  const { reduced, coarse } = app;
  const lenis = app.lenis;
  const chrome = app.chrome;
  const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = view) => r.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = view) => [...r.querySelectorAll<T>(s)];

  const main = $('[data-case]')!;
  const slug = main.dataset.case!;
  const lit = Number(main.dataset.lit);
  const name = $('[data-cs-name]')!.textContent!.trim();

  // ---------- Each case study is a world of its own: the page takes on the product's colour ----------
  const root = document.documentElement;
  const tint = main.dataset.tint!;
  root.style.setProperty('--bg', tint);
  root.style.setProperty('--day', tint);
  if (main.dataset.tone === 'dark') root.dataset.night = 'true'; else delete root.dataset.night;
  scope.add(() => { root.style.removeProperty('--bg'); root.style.removeProperty('--day'); delete root.dataset.night; });

  // ---------- The ribbon follows you here too: beside the name, behind the stage, down the lane ----------
  const w = getWorld();
  const canvas = document.querySelector<HTMLCanvasElement>('[data-world]')!;
  if (w) {
    canvas.hidden = false;
    w.resize();
    w.hooks.length = 0;
    w.moonState.alpha = 0;
    w.cards.release();
    w.ribbon.opacity = 1;
    w.ribbon.setTail(0);
    w.ribbon.setNight(main.dataset.tone === 'dark' ? 1 : 0);
    w.ribbon.setRadius(innerWidth < 861 ? 7 : 9);
    // drawn like a pen line as you read, its head a little above the bottom of the screen
    const driver = new RibbonDriver(w, { coarse, reduced, pace: 0.3, headAt: 0.82 });
    if (!reduced) { driver.intro.v = 0; gsap.to(driver.intro, { v: 1, duration: 1.8, delay: first ? 1.1 : 0.5, ease: 'power2.inOut' }); }
    const route = () => {
      const vw = innerWidth, vh = innerHeight;
      const pts: { x: number; y: number; z?: number }[] = [];
      const nm = textBox($('[data-cs-name]')!);
      const line = textBox($('.cs-line') ?? $('[data-cs-name]')!);
      const facts = pageBox($('.cs-facts')!);
      const stage = pageBox($('.cs-stage')!);
      // the hero: one long arc falling from the top right corner, through the space beside the name,
      // down the channel between the words and the facts, and in behind the stage
      const left = Math.max(line.r, nm.b > facts.t - 40 ? nm.r : 0) + 50, right = facts.l - 50;
      const chan = (left + right) / 2;
      if (vw < 861) {
        // a phone has no free lane beside the words: a short swing in from the edge, under the buttons
        // and into the stage
        const ctas = textBox($('.cs-ctas')!);
        const y0 = ctas.r < vw - 70 ? ctas.cy : ctas.b + 14;
        pts.push({ x: vw + 90, y: y0 - 40, z: -40 }, { x: vw - 28, y: y0 + 10, z: 0 }, { x: vw * 0.72, y: stage.t + 40, z: -60 }, { x: vw * 0.5, y: stage.cy, z: -60 });
        return pts;
      }
      pts.push({ x: vw + 120, y: nm.t - 30, z: -40 });
      if (right - left > 70) {
        pts.push({ x: Math.max(nm.r + 120, vw * 0.8), y: nm.t + nm.h * 0.3, z: 0 });
        pts.push({ x: chan + Math.min(80, (vw - chan) * 0.12), y: facts.t - 60, z: 20 });
        pts.push({ x: chan, y: facts.t + 70, z: 0 }, { x: chan, y: stage.t + 60, z: -60 });
      } else {
        // no channel (a long name): the arc settles into the right margin instead
        pts.push({ x: Math.max(nm.r + 50, vw - Math.min(200, vw * 0.3)), y: Math.min(nm.t + nm.h * 0.55, facts.t - 70), z: 0 });
        pts.push({ x: vw - 22, y: facts.t + 30, z: 0 }, { x: vw - 20, y: facts.b, z: -20 }, { x: vw - 30, y: stage.t + 60, z: -60 });
      }

      // below the stage it keeps to a lane of its own, right of the section labels (which stick to the
      // top of the screen while their section passes, so the lane is clear of the widest of them) and
      // left of the body. It sways a little, and where sections leave a wide band of white between
      // them, it writes a loop there, like a pen
      const secs = $$('.cs-sec');
      const labR = Math.max(...secs.map((sec) => { const t = sec.querySelector('.cs-h__t'); return t ? textBox(t).r : 0; }));
      const bodyL = Math.min(...secs.map((sec) => { const b = sec.querySelector('.cs-sec__body'); return b ? pageBox(b).l : vw; }));
      const L = (labR + bodyL) / 2, amp = Math.max(0, Math.min(38, (bodyL - labR) / 2 - 34));
      // the white between one section's last words and the next one's first
      const ink = (sec: Element) => {
        let t = Infinity, b = -Infinity;
        for (const el of sec.querySelectorAll('*')) {
          if (el.children.length) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          t = Math.min(t, r.top + scrollY); b = Math.max(b, r.bottom + scrollY);
        }
        return { t, b };
      };
      const blocks = [...secs, ...$$('.cs-reel')].map((el) => ({ el, ...(el.matches('.cs-reel') ? { t: pageBox(el).t, b: pageBox(el).b } : ink(el)) })).sort((a, b) => a.t - b.t);
      const loops: { y: number; h: number }[] = [];
      for (let i = 1; i < blocks.length; i++) {
        const h = blocks[i].t - blocks[i - 1].b - 30;
        if (h > 230 && (!loops.length || blocks[i].t - loops[loops.length - 1].y > vh * 1.2)) loops.push({ y: (blocks[i - 1].b + blocks[i].t) / 2, h });
      }
      const foot = pageBox($('.cs-foot')!);
      const end = foot.t - 40;
      // out from behind the stage already heading down the lane
      pts.push({ x: L, y: stage.b - 160, z: -60 });
      let y = stage.b - 40;
      for (const lp of [...loops, { y: Infinity, h: 0 }]) {
        // a loop half the band tall and about as wide, sitting in the band's white
        const a = Math.min(lp.h, 340) / 6.4, b = a * 3, c = a * 2.1;
        const y0 = Math.min(lp.y - a * Math.PI, end);
        // sway, fading out near each loop so it meets the loop going straight down
        for (; y < y0 - 60; y += 60) {
          const fade = Math.min(1, (y0 - y) / 260, (y - stage.b + 40) / 260);
          pts.push({ x: L + Math.sin(y / 430) * Math.sin(y / 1170 + 1) * amp * Math.max(0, fade), y, z: -60 });
        }
        if (lp.y === Infinity) break;
        // a prolate trochoid: down the lane, out to the right, round once, and back to the lane
        for (let i = 0; i <= 40; i++) {
          const t = -Math.PI + (i / 40) * Math.PI * 2;
          pts.push({ x: L + c * (1 + Math.cos(t)), y: lp.y + a * t - b * Math.sin(t), z: -60 + Math.sin(t) * 40 });
        }
        y = lp.y + a * Math.PI + 60;
      }
      // and it signs off with a turn towards the foot
      pts.push({ x: L, y: end - 120, z: -60 }, { x: L + 30, y: end - 30, z: -40 }, { x: L + 150, y: end, z: -20 });
      return pts;
    };
    const build = () => { if (!scope.dead) driver.build(route()); };
    w.hooks.push((t, dt) => driver.frame(t, dt));
    scope.tick((_, d) => { if (!app.paused) w.frame(Math.min(d / 1000, 1 / 20)); });
    let rt = 0;
    const later = () => { clearTimeout(rt); rt = window.setTimeout(() => { ST.refresh(); build(); }, 200); };
    const resized = resizeFilter(coarse);
    scope.on(window, 'resize', () => { if (resized()) later(); });
    scope.on(window, 'load', later);
    document.fonts?.ready.then(later);
    // and once the hero has finished rising into place, so nothing is measured mid-reveal
    const settle = window.setTimeout(later, 2600);
    scope.add(() => clearTimeout(settle));
    scope.observe(new ResizeObserver(later)).observe(view);
    scope.add(() => { clearTimeout(rt); w.hooks.length = 0; w.ribbon.setHead(0); w.invalidate(); w.frame(0); canvas.hidden = true; });
    build();
  }

  // ---------- Chrome: where you are, and the way out (the live product, or the code) ----------
  chrome.setMode('case', slug);
  const liveHref = main.dataset.live;
  const go: Go | null = liveHref
    ? { href: liveHref, label: main.dataset.liveLabel || 'Visit', external: true, live: main.dataset.liveWindow ? slug : undefined }
    : $('#code .cs-code__host') ? { href: '#code', label: 'Code' } : null;
  const top = () => chrome.setNow(name, lit, go);
  requestAnimationFrame(() => { chrome.sizeIsland(); top(); });
  sound.scene(slug);

  scope.gsap(() => {
    $$<HTMLElement>('[data-cs-section]').forEach((sec) => {
      ScrollTrigger.create({
        trigger: sec, start: 'top 50%', end: 'bottom 50%',
        onToggle: (self) => { if (self.isActive) chrome.setNow(sec.dataset.csSection!, lit, go); },
      });
    });
    ScrollTrigger.create({ trigger: '.cs-hero', start: 'top top', end: 'bottom 30%', onToggle: (self) => { if (self.isActive) top(); } });
    ScrollTrigger.create({ trigger: '.cs-next', start: 'top 60%', onEnter: () => chrome.setNow('Next', 0.75), onLeaveBack: () => chrome.setNow('Where it is now', lit, go) });
  });

  // ---------- Code: inline, and full screen on demand ----------
  app.repos.mountInline(view, scope);
  if (first && location.hash.startsWith('#code/')) app.repos.fromHash();

  // ---------- Arrival: the name rises, the rest follows (as the curtain lifts, if you came from another page) ----------
  const intro = () => {
    if (reduced) return;
    scope.gsap(() => {
      const h1 = $('[data-cs-name]')!;
      gsap.set(h1, { opacity: 1 });
      const split = SplitText.create(h1, { type: 'chars', mask: 'chars' });
      gsap.from(split.chars, { yPercent: 110, duration: 1.6, ease: EASE, stagger: 0.05, delay: 0.05, onComplete: () => split.revert() });
      gsap.fromTo($$('[data-cs-in]'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.3, ease: EASE, stagger: 0.08, delay: 0.35 });
      gsap.from('.cs-hero__top', { opacity: 0, duration: 1, delay: 0.15 });
      gsap.from('.cs-stage', { clipPath: 'inset(12% 6% 0% 6% round 28px)', duration: 1.6, ease: EASE, delay: 0.3 });
    });
  };
  if (!reduced && !first) gsap.set([$('[data-cs-name]'), ...$$('[data-cs-in]')], { opacity: 0 });
  if (first) requestAnimationFrame(intro);

  // ---------- The stage: devices float at different depths, and lean toward the pointer ----------
  const stage = $('[data-cs-stage]');
  if (stage && !reduced) {
    const layers = $$<HTMLElement>('[data-depth]', stage).map((el) => ({ el, d: Number(el.dataset.depth), y: gsap.quickSetter(el, 'y', 'px') }));
    scope.gsap(() => ScrollTrigger.create({
      trigger: stage, start: 'top bottom', end: 'bottom top',
      onUpdate: (self) => layers.forEach((l) => l.y((0.5 - self.progress) * innerHeight * l.d)),
    }));
    if (!coarse) {
      const set = $('.cs-stage__set', stage)!;
      const rx = gsap.quickTo(set, 'rotationX', { duration: 1, ease: 'power3.out' });
      const ry = gsap.quickTo(set, 'rotationY', { duration: 1, ease: 'power3.out' });
      gsap.set(set, { transformPerspective: 1600 });
      scope.on(stage, 'pointermove', (e) => {
        const r = stage.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 7);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 5);
      });
      scope.on(stage, 'pointerleave', () => { rx(0); ry(0); });
    }
  }

  // ---------- Numbers count up the first time you see them ----------
  $$<HTMLElement>('[data-count]').forEach((el) => {
    const m = /^(\D*)([\d,]+)(.*)$/.exec(el.dataset.count!);
    if (!m || reduced) return;
    const [, pre, raw, post] = m;
    const target = Number(raw.replace(/,/g, ''));
    if (target < 3) return;
    const fmt = (v: number) => (raw.includes(',') ? Math.round(v).toLocaleString('en-IN') : String(Math.round(v)));
    const n = { v: 0 };
    el.textContent = `${pre}0${post}`;
    scope.gsap(() => gsap.to(n, {
      v: target, duration: 1.8, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onUpdate: () => { el.textContent = `${pre}${fmt(n.v)}${post}`; },
    }));
  });

  // ---------- Reading: words brighten as you scroll, blocks rise into place ----------
  if (!reduced) scope.gsap(() => {
    $$<HTMLElement>('[data-brighten]').forEach((p) => {
      SplitText.create(p, {
        type: 'words', autoSplit: true,
        onSplit: (self) => gsap.fromTo(self.words, { opacity: 0.18 }, {
          opacity: 1, ease: 'none', stagger: 0.1,
          scrollTrigger: { trigger: p, start: 'top 85%', end: 'bottom 55%', scrub: true },
        }),
      });
    });
    $$('[data-cs-rise]').forEach((el) => gsap.from(el, { opacity: 0, y: 34, duration: 1.3, ease: EASE, scrollTrigger: { trigger: el, start: 'top 90%' } }));
    $$('.cs-label').forEach((el) => gsap.from(el, { opacity: 0, x: -14, duration: 1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 90%' } }));
  });

  // ---------- Walkthrough: the step nearest the middle of the screen is the one on the device ----------
  const walk = $('[data-walk]');
  if (walk && !walk.classList.contains('cs-walk--terminal')) {
    const steps = $$<HTMLElement>('[data-walk-step]', walk);
    const frames = $$<HTMLElement>('[data-walk-frame]', walk);
    const sticky = $('.cs-walk__sticky', walk);
    // a rail of numbered steps under the device: where you are, and a way to jump
    const pips = document.createElement('div');
    pips.className = 'cs-walk__pips';
    pips.innerHTML = steps.map((st, i) => `<button type="button" data-pip="${i}" aria-label="Step ${i + 1}: ${st.querySelector('.cs-walk__t')?.textContent?.trim() ?? ''}"><span>${String(i + 1).padStart(2, '0')}</span><i></i></button>`).join('');
    sticky?.append(pips);
    const pipEls = $$<HTMLElement>('[data-pip]', pips);
    let current = -1;
    const show = (i: number) => {
      if (i === current) return;
      const firstShow = current === -1;
      current = i;
      steps.forEach((st, k) => (st.dataset.on = String(k === i)));
      pipEls.forEach((pp, k) => { pp.dataset.on = String(k === i); pp.dataset.past = String(k < i); });
      const want = new Set<Element>();
      for (const group of $$('.cs-walk__desk, .cs-walk__phone', walk)) {
        const own = $$<HTMLElement>('[data-walk-frame]', group);
        const pick = own.filter((f) => Number(f.dataset.walkFrame) <= i).pop() ?? own[0];
        if (pick) want.add(pick);
      }
      frames.forEach((f) => (f.dataset.on = String(want.has(f))));
      if (!firstShow) sound.chime(i, 0.6);
    };
    const titles = steps.map((st) => st.querySelector<HTMLElement>('.cs-walk__t') ?? st);
    const pick = () => {
      let best = 0, bd = Infinity;
      titles.forEach((t, i) => { const r = t.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - innerHeight * 0.42); if (d < bd) { bd = d; best = i; } });
      show(best);
    };
    let inView = false;
    scope.observe(new IntersectionObserver(([e]) => { inView = e.isIntersecting; })).observe(walk);
    scope.tick(() => { if (inView) pick(); });
    show(0);
    const goTo = (i: number) => {
      const t = titles[i].getBoundingClientRect();
      const y = t.top + scrollY - innerHeight * 0.42 + t.height / 2;
      lenis ? lenis.scrollTo(y, { duration: 1.1 }) : scrollTo({ top: y, behavior: 'smooth' });
    };
    pipEls.forEach((pp, i) => scope.on(pp, 'click', () => goTo(i)));
    titles.forEach((t, i) => { t.style.cursor = 'pointer'; scope.on(t, 'click', () => goTo(i)); });
    // the device leans a little toward the pointer
    const dev = $('.cs-walk__frames', walk);
    if (dev && !reduced && !coarse) {
      const xTo = gsap.quickTo(dev, 'x', { duration: 1.2, ease: 'power3.out' });
      const yTo = gsap.quickTo(dev, 'y', { duration: 1.2, ease: 'power3.out' });
      const rTo = gsap.quickTo(dev, 'rotation', { duration: 1.4, ease: 'power3.out' });
      scope.on(walk, 'pointermove', (e) => {
        const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
        xTo(nx * 18); yTo(ny * 12); rTo(nx * 1.6);
      });
      scope.on(walk, 'pointerleave', () => { xTo(0); yTo(0); rTo(0); });
    }
  }

  // ---------- The system: a line runs down the pipeline, and each part lights as the bead reaches it ----------
  const system = $('[data-system]');
  if (system) {
    const drawn = $('[data-system-line]', system)!;
    const bead = $('[data-system-bead]', system)!;
    const rail = drawn.parentElement!;
    const nodes = $$<HTMLElement>('[data-system-node]', system);
    const at = (p: number) => {
      drawn.style.transform = `scaleY(${p})`;
      const h = rail.offsetHeight;
      bead.style.top = `${p * h}px`;
      const r0 = rail.getBoundingClientRect().top;
      nodes.forEach((n, i) => {
        const dot = n.querySelector('.cs-sys__dot')!.getBoundingClientRect();
        const on = String(p >= 1 || r0 + p * h >= dot.top + dot.height / 2 - 2);
        if (n.dataset.on !== on) { n.dataset.on = on; if (on === 'true' && p > 0.01 && p < 1) sound.chime(i, 0.35); }
      });
    };
    at(reduced ? 1 : 0);
    if (!reduced) scope.gsap(() => ScrollTrigger.create({ trigger: system, start: 'top 62%', end: 'bottom 62%', scrub: 0.5, onUpdate: (self) => at(self.progress) }));
  }

  // ---------- Screens: a reel that runs sideways as you scroll down; any screen opens large ----------
  const wallEl = $('[data-reel]');
  if (wallEl) {
    const track = $('[data-reel-track]', wallEl)!;
    const bar = $('[data-reel-bar]', wallEl)!;
    const nowEl = $('[data-reel-now]', wallEl)!;
    const items = $$<HTMLElement>('.cs-reel__item', wallEl);
    const desktop = matchMedia('(min-width: 861px)');
    let dist = 0;
    const size = () => {
      if (!desktop.matches || reduced) { wallEl.style.height = ''; gsap.set(track, { x: 0 }); return; }
      dist = Math.max(0, track.scrollWidth - innerWidth);
      wallEl.style.height = `${innerHeight + dist}px`;
    };
    size();
    let rs = 0;
    const wallResized = resizeFilter(coarse);
    scope.on(window, 'resize', () => { if (!wallResized()) return; clearTimeout(rs); rs = window.setTimeout(() => { size(); ScrollTrigger.refresh(); }, 150); });
    scope.add(() => clearTimeout(rs));
    $$<HTMLImageElement>('img', track).forEach((im) => { if (!im.complete) scope.on(im, 'load', size); });
    let shown = -1;
    scope.gsap(() => ScrollTrigger.create({
      trigger: wallEl, start: 'top top', end: 'bottom bottom',
      onUpdate: (st) => {
        if (!desktop.matches || reduced) return;
        gsap.set(track, { x: -st.progress * dist });
        bar.style.transform = `scaleX(${st.progress.toFixed(4)})`;
        let best = 0, bd = Infinity;
        items.forEach((it, i) => { const r = it.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - innerWidth / 2); if (d < bd) { bd = d; best = i; } });
        if (best !== shown) { shown = best; nowEl.textContent = String(best + 1).padStart(2, '0'); }
      },
    }));

    const zoom = $<HTMLDialogElement>('[data-zoom-dialog]')!;
    const zimg = $<HTMLImageElement>('[data-zoom-img]', zoom)!;
    scope.on(wallEl, 'click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-zoom]');
      if (!b) return;
      zimg.src = b.dataset.zoom!;
      zimg.alt = b.getAttribute('aria-label')?.replace(/^Look closer: /, '') ?? '';
      zoom.dataset.kind = b.dataset.zoomKind!;
      zoom.showModal();
      lenis?.stop();
      sound.whoosh(true);
      if (!reduced) {
        const from = b.getBoundingClientRect();
        requestAnimationFrame(() => {
          const to = zimg.getBoundingClientRect();
          if (!to.width) return;
          zimg.animate([
            { transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width})`, opacity: 0.4 },
            { transform: 'none', opacity: 1 },
          ], { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        });
      }
    });
    scope.on(zoom, 'click', () => zoom.close());
    scope.on(zoom, 'close', () => { lenis?.start(); sound.whoosh(false); });
    scope.add(() => { if (zoom.open) zoom.close(); });
  }

  // ---------- The live site, framed, on request ----------
  $$<HTMLElement>('[data-live-frame]').forEach((win) => {
    const btn = $<HTMLButtonElement>('[data-live-load]', win)!;
    scope.on(btn, 'click', () => {
      const f = document.createElement('iframe');
      f.src = win.dataset.liveFrame!;
      f.title = `${new URL(win.dataset.liveFrame!).host}, live`;
      f.loading = 'eager';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox');
      f.setAttribute('data-lenis-prevent', '');
      btn.replaceWith(f);
    });
  });

  // ---------- Alfard's gate: a session you can answer ----------
  type GateScript = { intro: { t: string; c: string }[]; review: [string, string][] };
  $$<HTMLElement>('[data-gate][data-mode="live"]').forEach((el) => {
    const script = JSON.parse(el.dataset.gateScript!) as GateScript;
    const body = $('[data-gate-body]', el)!;
    const hint = $('[data-gate-hint]', el)!;
    const answers = $$<HTMLButtonElement>('[data-gate-answer]', el);
    const replay = $<HTMLButtonElement>('[data-gate-replay]', el)!;
    const steps = $$<HTMLElement>('[data-walk-step]');
    let token = 0, visible = false, started = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
    const state = (s: string, step: number) => {
      el.dataset.state = s;
      steps.forEach((st, i) => (st.dataset.on = String(i === step)));
    };
    const line = (cls: string, text = '') => { const p = document.createElement('p'); p.className = `gate__l gate__l--${cls}`; p.textContent = text; body.append(p); return p; };
    const type = async (p: HTMLElement, text: string, t: number, cps = 90) => {
      if (reduced) { p.textContent = text; return; }
      for (let i = 2; i <= text.length + 1; i += 2) { if (t !== token) return; p.textContent = text.slice(0, i); await wait(2000 / cps); }
    };
    async function run() {
      const t = ++token;
      body.innerHTML = '';
      answers.forEach((b) => (b.disabled = true));
      replay.hidden = true;
      state('typing', 0);
      hint.textContent = 'The agent is working.';
      for (const l of script.intro) { await type(line(l.c), l.t, t); if (t !== token) return; await wait(260); }
      const box = document.createElement('div');
      box.className = 'gate__review';
      box.innerHTML = '<p class="gate__review-k">Review required</p>';
      body.append(box);
      requestAnimationFrame(() => box.classList.add('is-on'));
      for (const [k, v] of script.review) {
        await wait(140); if (t !== token) return;
        const row = document.createElement('p'); row.className = 'gate__row';
        row.innerHTML = `<span></span><span></span>`;
        row.children[0].textContent = k; row.children[1].textContent = v;
        box.append(row);
      }
      await wait(300); if (t !== token) return;
      const ask = line('ask', 'Approve? [y/n]: ');
      ask.insertAdjacentHTML('beforeend', '<span class="gate__cursor" aria-hidden="true"></span>');
      state('await', 1);
      answers.forEach((b) => (b.disabled = false));
      hint.textContent = 'It is irreversible, so the agent stopped. Your call: press y or n.';
      sound.chime(4, 0.5);
    }
    async function answer(k: 'y' | 'n') {
      if (el.dataset.state !== 'await') return;
      const t = token;
      answers.forEach((b) => (b.disabled = true));
      const ask = body.querySelector('.gate__l--ask:last-of-type')!;
      ask.querySelector('.gate__cursor')?.remove();
      ask.insertAdjacentHTML('beforeend', `<span class="gate__answer">${k}</span>`);
      sound.arpeggio(k === 'y');
      await wait(420); if (t !== token) return;
      if (k === 'y') {
        await type(line('yes'), 'Sent. I replied to slickdash: “Hi, I’m doing well, thank you!”', t);
        state('approved', 2);
      } else {
        await type(line('no'), 'Denied. Nothing was sent, and the draft is kept for you.', t);
        state('denied', 2);
      }
      await wait(240); if (t !== token) return;
      const entry = JSON.stringify({ ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), event: 'gate', tool: 'gmail_send_message', decision: k === 'y' ? 'approved' : 'denied', channel: 'terminal' });
      await type(line('log', ''), `audit.jsonl  ${entry}`, t, 160);
      hint.textContent = k === 'y' ? 'Approved, sent, and written to the audit log.' : 'Denied, and still written to the audit log. Nothing runs silently.';
      replay.hidden = false;
    }
    answers.forEach((b) => scope.on(b, 'click', () => answer(b.dataset.gateAnswer as 'y' | 'n')));
    scope.on(replay, 'click', () => run());
    scope.on(window, 'keydown', (e) => {
      if (!visible || (e.target as HTMLElement).matches('input, textarea') || e.metaKey || e.ctrlKey) return;
      if (e.key === 'y' || e.key === 'n') answer(e.key);
    });
    scope.observe(new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible && !started) { started = true; run(); }
    }, { threshold: 0.35 })).observe(el);
    scope.add(() => { token++; });
  });

  // ---------- Next: keep scrolling and the page becomes the next case study ----------
  const nextEl = $('[data-next]');
  if (nextEl) {
    const d = nextEl.dataset;
    const litLayer = $('[data-next-layer="lit"]', nextEl)!;
    const arcs = $$<SVGCircleElement>('[data-next-arc]', nextEl);
    const bars = $$<HTMLElement>('[data-next-bar]', nextEl);
    const link = $<HTMLAnchorElement>('[data-next-link]', nextEl)!;
    const held = { title: d.nextTitle!, kicker: d.nextKicker!, lit: Number(d.nextLit), bg: d.nextBg!, ink: d.nextInk! };
    let armed = false, gone = false, last = 0;
    const extras = $$<HTMLElement>('.cs-next__top, .cs-next__line', nextEl);
    const paint = (p: number) => {
      // the curtain carries only the moon, kicker and name, so the rest bows out before the hand-over
      const fade = String(1 - Math.min(1, Math.max(0, (p - 0.8) / 0.17)));
      extras.forEach((x) => { if (x.style.opacity !== fade) x.style.opacity = fade; });
      litLayer.style.clipPath = p >= 0.999 ? 'none' : `ellipse(${(p * 125).toFixed(2)}% 105% at 100% 50%)`;
      arcs.forEach((a) => (a.style.strokeDashoffset = String(1 - p * 0.88)));
      bars.forEach((b) => (b.style.transform = `scaleX(${Math.min(1, p / 0.97).toFixed(4)})`));
    };
    const leave = () => {
      if (gone || app.router.busy) return;
      gone = true;
      sound.whoosh(true);
      app.router.go(d.nextHref!, { held });
    };
    paint(reduced ? 1 : 0);
    if (!reduced) scope.gsap(() => ScrollTrigger.create({
      trigger: nextEl, start: 'top top', end: 'bottom bottom',
      onUpdate: (self) => {
        const p = self.progress;
        paint(p);
        // only a visitor scrolling down into it carries on: arriving here by the back button does not
        if (p < 0.85) armed = true;
        if (armed && p >= 0.995 && last < p && self.direction === 1) leave();
        last = p;
      },
    }));
    scope.on(link, 'click', (e) => {
      if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) return;
      const r = nextEl.getBoundingClientRect();
      // already filled with the next project's colour: hand straight over, no curtain
      if (r.top <= 1 && (reduced || r.bottom - innerHeight < innerHeight * 0.1)) { e.preventDefault(); e.stopPropagation(); leave(); }
    }, { capture: true });
  }

  scope.on(window, 'load', () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => { if (!scope.dead) ScrollTrigger.refresh(); });

  return {
    intro,
    target(hash) {
      if (hash === '#top' || hash === '#') return { el: document.body, offset: 0 };
      try { const el = view.querySelector(hash); return el ? { el, offset: -90, label: (el as HTMLElement).dataset.csSection } : null; } catch { return null; }
    },
  };
}
