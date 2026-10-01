import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { emblemPath } from './phase';
import { moonTonight } from './moonphase';
import type { Scope } from './scope';

/** Buttons lean toward the pointer, and the label a little further. */
export function magnetic(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    if (el.dataset.magBound) return;
    el.dataset.magBound = '1';
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    const label = el.querySelector<HTMLElement>('[data-wave]') ?? el;
    const lx = gsap.quickTo(label, 'x', { duration: 0.6, ease: 'power3.out' });
    const ly = gsap.quickTo(label, 'y', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      xTo(dx * 0.28); yTo(dy * 0.38); lx(dx * 0.1); ly(dy * 0.12);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to([el, label], { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.4)', overwrite: true });
    });
  });
}

/** Splits a label into letters so a wave of weight can pass through them on hover. */
export function wave(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-wave]').forEach((el) => {
    if (el.dataset.waved) return;
    el.dataset.waved = '1';
    const text = el.textContent ?? '';
    const esc = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const w0 = parseFloat(getComputedStyle(el).fontWeight) || 560;
    el.classList.add('wave');
    el.style.setProperty('--w0', String(w0));
    el.innerHTML = `<span class="sr-only">${esc(text)}</span>` + [...text].map((ch, i) => `<span class="wave__c" aria-hidden="true" style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
  });
}

/** Buttons fill from the side the pointer came in. */
export function fillFrom(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.btn').forEach((b) => {
    if (b.dataset.fillBound) return;
    b.dataset.fillBound = '1';
    b.addEventListener('pointerenter', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--from', e.clientX - r.left < r.width / 2 ? '0%' : '100%');
    });
  });
}

/** Each letter's weight swells as the pointer comes near, from its own resting weight. */
export function kinetic(lines: HTMLElement[], scope: Scope) {
  const split = SplitText.create(lines, { type: 'chars', charsClass: 'kchar' });
  const chars = split.chars as HTMLElement[];
  const base = chars.map((c) => parseFloat(getComputedStyle(c).fontWeight) || 540);
  const peak = base.map((b) => Math.min(900, b + 320));
  const radius = 230;
  const w = [...base];
  let rects: DOMRect[] = [];
  const measure = () => (rects = chars.map((c) => c.getBoundingClientRect()));
  let px = -9999, py = -9999, active = false;
  scope.on(window, 'pointermove', (e) => { px = e.clientX; py = e.clientY; active = true; }, { passive: true });
  scope.on(window, 'scroll', () => { rects = []; }, { passive: true });
  scope.on(window, 'resize', () => { rects = []; });
  scope.tick(() => {
    if (!active) return;
    if (!rects.length) measure();
    let moving = false;
    chars.forEach((c, i) => {
      const r = rects[i];
      if (r.bottom < -100 || r.top > innerHeight + 100) return;
      const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
      const f = Math.max(0, 1 - d / radius);
      const target = base[i] + (peak[i] - base[i]) * f * f * (3 - 2 * f);
      const next = w[i] + (target - w[i]) * 0.14;
      if (Math.abs(next - w[i]) > 0.3) moving = true;
      w[i] = next;
      c.style.fontVariationSettings = `'wght' ${next.toFixed(1)}`;
    });
    if (!moving && px < 0) active = false;
  });
  return split;
}

/** Giant type leans with scroll velocity. */
export function skewOnScroll(getVelocity: () => number, scope: Scope, root: ParentNode) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-chapter-name], .practice__title, .contact__whisper')];
  const setters = els.map((el) => gsap.quickTo(el, 'skewX', { duration: 0.5, ease: 'power3.out' }));
  let last = 0;
  scope.tick(() => {
    const v = Math.round(gsap.utils.clamp(-6, 6, -getVelocity() * 0.18) * 20) / 20;
    if (v === last) return;
    last = v;
    setters.forEach((s) => s(v));
  });
}

/** Copy the email address, with a spoken confirmation. */
export function copyEmail(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    if (btn.dataset.copyBound) return;
    btn.dataset.copyBound = '1';
    const state = btn.querySelector<HTMLElement>('[data-copy-state]');
    let timer = 0;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy!);
        if (state) state.textContent = 'Copied to your clipboard';
      } catch {
        location.href = `mailto:${btn.dataset.copy}`;
        return;
      }
      btn.dataset.copied = 'true';
      clearTimeout(timer);
      timer = window.setTimeout(() => { btn.dataset.copied = 'false'; if (state) state.textContent = 'Click to copy'; }, 2600);
    });
  });
}

/** The real moon tonight, drawn with the same geometry as the logo. */
export function tonight(root: ParentNode = document) {
  const m = moonTonight();
  const glyph = root.querySelector<SVGPathElement>('[data-tonight-glyph]');
  const text = root.querySelector<HTMLElement>('[data-tonight-text]');
  if (glyph) {
    glyph.setAttribute('d', emblemPath(m.lit));
    glyph.setAttribute('transform', m.waxing ? 'rotate(24)' : 'rotate(24) scale(-1 1)');
  }
  if (text) text.textContent = `Tonight the moon is ${m.name}, ${m.pct}% lit`;
}

/** The footer wordmark's highlight follows the pointer across the metal. */
export function chromeMark(scope: Scope) {
  const grad = document.querySelector<SVGLinearGradientElement>('[data-mark-gradient]');
  const mark = document.querySelector<HTMLElement>('[data-chrome-mark]');
  if (!grad || !mark) return;
  const state = { x: 0.5 };
  const apply = () => {
    const x = state.x * 365;
    grad.setAttribute('x1', String(x - 260));
    grad.setAttribute('x2', String(x + 260));
  };
  scope.on(window, 'pointermove', (e) => {
    const r = mark.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    gsap.to(state, { x: (e.clientX - r.left) / r.width, duration: 0.9, ease: 'power3.out', onUpdate: apply, overwrite: true });
  }, { passive: true });
  apply();
}

/** The tools list drifts sideways, faster while you scroll, and turns with the scroll direction. */
export function marquee(getVelocity: () => number, scope: Scope, root: ParentNode) {
  const track = root.querySelector<HTMLElement>('[data-marquee]');
  if (!track) return;
  let x = 0, dir = -1, boost = 0;
  scope.tick((_, delta) => {
    const r = track.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) return;
    const v = getVelocity();
    if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
    boost += (Math.min(18, Math.abs(v)) - boost) * 0.1;
    x += dir * (0.045 + boost * 0.02) * delta;
    const half = track.scrollWidth / 2;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
  });
}
