import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { sound } from '../lib/audio';
import { app, type PageCtx, type PageHandle } from '../lib/app';
import type { Go } from '../lib/chrome';

const EASE = 'expo.out';

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

  // ---------- Walkthrough: each step brings its screens forward ----------
  const walk = $('[data-walk]');
  if (walk && !walk.classList.contains('cs-walk--terminal')) {
    const steps = $$<HTMLElement>('[data-walk-step]', walk);
    const frames = $$<HTMLElement>('[data-walk-frame]', walk);
    let current = -1;
    const show = (i: number) => {
      if (i === current) return;
      const firstShow = current === -1;
      current = i;
      steps.forEach((s, k) => (s.dataset.on = String(k === i)));
      const want = new Set<Element>();
      for (const group of $$('.cs-walk__desk, .cs-walk__phone', walk)) {
        const own = $$<HTMLElement>('[data-walk-frame]', group);
        const pick = own.filter((f) => Number(f.dataset.walkFrame) <= i).pop() ?? own[0];
        if (pick) want.add(pick);
      }
      frames.forEach((f) => (f.dataset.on = String(want.has(f))));
      if (!firstShow) sound.chime(i, 0.6);
    };
    show(0);
    scope.gsap(() => steps.forEach((s, i) => ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && show(i) })));
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

  // ---------- Screens: the wall's columns drift against each other as you pass; any screen opens large ----------
  const wallEl = $('[data-wall]');
  if (wallEl) {
    const cols = $$<HTMLElement>('[data-wall-col]', wallEl);
    const speeds = cols.map((_, i) => (i % 2 ? 1 : -1) * (0.32 + ((i * 37) % 5) * 0.06));
    const setters = cols.map((c) => gsap.quickSetter(c, 'y', 'px'));
    const place = (p: number) => cols.forEach((_, i) => setters[i]((p - 0.5) * speeds[i] * innerHeight * 1.4));
    place(0.5);
    if (!reduced) {
      scope.gsap(() => ScrollTrigger.create({ trigger: wallEl, start: 'top bottom', end: 'bottom top', onUpdate: (self) => place(self.progress) }));
      if (!coarse) {
        const plane = $('[data-wall-plane]', wallEl)!;
        gsap.set(plane, { xPercent: -50, yPercent: -50, rotationX: 26, rotation: -13 });
        const rz = gsap.quickTo(plane, 'rotation', { duration: 1.4, ease: 'power3.out' });
        const rx = gsap.quickTo(plane, 'rotationX', { duration: 1.4, ease: 'power3.out' });
        scope.on(wallEl, 'pointermove', (e) => {
          const r = wallEl.getBoundingClientRect();
          rz(-13 + ((e.clientX - r.left) / r.width - 0.5) * 4);
          rx(26 - ((e.clientY - r.top) / r.height - 0.5) * 4);
        });
        scope.on(wallEl, 'pointerleave', () => { rz(-13); rx(26); });
      }
    }

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

  // ---------- Code: the page keeps the scroll until you choose to read inside ----------
  $$<HTMLElement>('[data-code-frame]').forEach((frame) => {
    const shield = $<HTMLButtonElement>('[data-code-shield]', frame)!;
    const host = $('[data-repo-inline]', frame)!;
    let leaveT = 0;
    const activate = () => {
      frame.dataset.active = 'true';
      host.setAttribute('data-lenis-prevent', '');
      sound.whoosh(true);
      clearTimeout(leaveT);
      host.querySelector<HTMLElement>('input, button, a, [tabindex]')?.focus({ preventScroll: true });
    };
    const rest = () => {
      if (frame.dataset.active !== 'true') return;
      frame.dataset.active = 'false';
      host.removeAttribute('data-lenis-prevent');
    };
    scope.on(shield, 'click', activate);
    // leave the code and the page takes the wheel back
    scope.on(frame, 'pointerleave', () => { clearTimeout(leaveT); leaveT = window.setTimeout(rest, 450); });
    scope.on(frame, 'pointerenter', () => clearTimeout(leaveT));
    scope.on(frame, 'keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape' && !document.querySelector('dialog[open]')) { rest(); shield.focus(); } });
    scope.add(() => clearTimeout(leaveT));
  });

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
