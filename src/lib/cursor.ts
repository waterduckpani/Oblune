import { gsap } from 'gsap';

/**
 * The pointer, redrawn: an ink dot that is exactly where you are, and a ring that follows on a
 * spring, leaning into the direction you move. Both are drawn in "difference", so they read on the
 * day page, at night and over the work's own colours.
 *
 * - Over something you can press, the ring swells and fills like a moon waxing.
 * - Over anything marked data-cursor, it becomes a pill with that word (Open, Drag, Copy…).
 * - Over a text field the native caret takes over; pressing squeezes the ring.
 * - It hides when the pointer leaves the page or enters a frame (a live site, which has its own).
 */
const PRESSABLE = 'a, button, [role="button"], label, summary, select, [data-zoom]';
const TEXT = 'input:not([type="radio"]):not([type="checkbox"]):not([type="submit"]), textarea, [contenteditable="true"]';

export function initCursor(reduced: boolean) {
  const root = document.querySelector<HTMLElement>('[data-cur]');
  if (!root || !matchMedia('(pointer: fine)').matches) return;
  const ring = root.querySelector<HTMLElement>('[data-cur-ring]')!;
  const dot = root.querySelector<HTMLElement>('[data-cur-dot]')!;
  const label = root.querySelector<HTMLElement>('[data-cur-label]')!;
  const text = root.querySelector<HTMLElement>('[data-cur-text]')!;
  document.documentElement.classList.add('has-cur');

  const p = { x: -100, y: -100 };
  const r = { x: -100, y: -100, vx: 0, vy: 0 };
  const l = { x: -100, y: -100 };
  let seen = false;
  let state = '';
  const set = (s: string) => { if (s !== state) { state = s; root.dataset.state = s; } };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    p.x = e.clientX; p.y = e.clientY;
    if (!seen) { seen = true; r.x = l.x = p.x; r.y = l.y = p.y; root.dataset.on = 'true'; }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { root.dataset.on = 'false'; seen = false; });
  addEventListener('blur', () => { root.dataset.on = 'false'; seen = false; });
  addEventListener('pointerdown', () => root.classList.add('is-down'), { passive: true });
  addEventListener('pointerup', () => root.classList.remove('is-down'), { passive: true });

  // what is under the pointer decides the shape
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    if (!t?.closest) return;
    if (t.closest('iframe')) { root.dataset.on = 'false'; seen = false; return; }
    const lab = t.closest<HTMLElement>('[data-cursor]');
    if (lab) { text.textContent = lab.dataset.cursor!; set('label'); return; }
    if (t.closest(TEXT)) { set('text'); return; }
    if (t.closest(PRESSABLE)) { set('press'); return; }
    set('');
  });

  gsap.ticker.add((_, delta) => {
    if (!seen) return;
    const dt = Math.min(delta / 1000, 1 / 30);
    dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    if (reduced) {
      r.x = l.x = p.x; r.y = l.y = p.y;
      ring.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    } else {
      // a slightly underdamped spring, sub-stepped so it holds at any frame rate
      const k = 340, c = 30, n = Math.max(1, Math.ceil(dt / 0.006));
      for (let i = 0; i < n; i++) {
        const h = dt / n;
        r.vx += (-k * (r.x - p.x) - c * r.vx) * h; r.x += r.vx * h;
        r.vy += (-k * (r.y - p.y) - c * r.vy) * h; r.y += r.vy * h;
      }
      const speed = Math.hypot(r.vx, r.vy);
      const stretch = state === 'label' ? 1 : 1 + Math.min(0.35, speed / 4200);
      const ang = Math.atan2(r.vy, r.vx);
      ring.style.transform = `translate3d(${r.x}px, ${r.y}px, 0) rotate(${ang}rad) scale(${stretch}, ${1 / stretch})`;
      l.x += (p.x - l.x) * (1 - Math.exp(-22 * dt));
      l.y += (p.y - l.y) * (1 - Math.exp(-22 * dt));
    }
    label.style.transform = `translate3d(${l.x}px, ${l.y}px, 0)`;
  });
}
