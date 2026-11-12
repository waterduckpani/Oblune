import { sound } from './audio';
import type { Scope } from './scope';

/**
 * Every hairline marked `data-string` is a string you can play. Cross it with the pointer and it
 * bends where you crossed, rings out as a damped standing wave and plays a plucked note, higher for
 * shorter strings. A string at rest is a plain SVG line: nothing runs until one is plucked.
 */
type S = { el: HTMLElement; path: SVGPathElement; r: DOMRect | null; amp: number; at: number; x: number; born: number; note: number };

const NS = 'http://www.w3.org/2000/svg';
const H = 26; // the svg's height: room for the string to swing

export function strings(root: ParentNode, scope: Scope, opts: { reduced: boolean; coarse: boolean }) {
  const list: S[] = [...root.querySelectorAll<HTMLElement>('[data-string]')].map((el, i) => {
    el.replaceChildren();
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(NS, 'path');
    svg.append(path);
    el.append(svg);
    return { el, path, r: null, amp: 0, at: 0, x: 0.5, born: 0, note: i };
  });
  const draw = (s: S, bend: number) => {
    const w = s.r?.width ?? s.el.clientWidth;
    const y = H / 2;
    if (Math.abs(bend) < 0.05) { s.path.setAttribute('d', `M0 ${y}H${w.toFixed(1)}`); return; }
    // a plucked string is two straight runs to the pluck point, softened into one curve
    const px = s.x * w;
    s.path.setAttribute('d', `M0 ${y}Q${(px * 0.5).toFixed(1)} ${(y + bend).toFixed(1)} ${px.toFixed(1)} ${(y + bend).toFixed(1)}Q${(px + (w - px) * 0.5).toFixed(1)} ${(y + bend).toFixed(1)} ${w.toFixed(1)} ${y}`);
  };
  const measure = () => list.forEach((s) => { s.r = s.el.getBoundingClientRect(); draw(s, 0); });
  measure();
  scope.observe(new ResizeObserver(measure)).observe(document.documentElement);
  if (opts.reduced || opts.coarse || !list.length) return;

  // rects go stale as the page scrolls: refresh them lazily, at most once a frame
  let stale = true;
  scope.on(window, 'scroll', () => { stale = true; }, { passive: true });
  scope.on(window, 'resize', () => { stale = true; });

  let px = -1, py = -1;
  let ringing = 0;
  const now = () => performance.now() / 1000;
  scope.on(window, 'pointermove', (e) => {
    const x = e.clientX, y = e.clientY;
    if (px >= 0) {
      if (stale) { list.forEach((s) => (s.r = s.el.getBoundingClientRect())); stale = false; }
      for (const s of list) {
        const r = s.r!;
        if (r.width < 8 || r.bottom < -40 || r.top > innerHeight + 40) continue;
        const ly = r.top;
        // crossed the line between the last pointer position and this one, inside its length?
        if ((py - ly) * (y - ly) > 0 || py === y) continue;
        const t = (ly - py) / (y - py);
        const cx = px + (x - px) * t;
        if (cx < r.left + 4 || cx > r.right - 4) continue;
        const t0 = now();
        if (t0 - s.born < 0.09) continue;
        const speed = Math.min(1, Math.hypot(x - px, y - py) / 40);
        s.x = (cx - r.left) / r.width;
        s.amp = (y > py ? 1 : -1) * (3 + speed * 7);
        s.at = s.born = t0;
        ringing++;
        // shorter strings ring higher; where you pluck it shades the note a little
        const len = Math.min(1, r.width / 1200);
        sound.pluck(Math.round((1 - len) * 5 + (s.note % 3)), 0.3 + speed * 0.5);
      }
    }
    px = x; py = y;
  }, { passive: true });
  scope.on(document, 'pointerleave', () => { px = py = -1; });

  scope.tick(() => {
    if (!ringing) return;
    const t = now();
    ringing = 0;
    for (const s of list) {
      if (!s.amp) continue;
      const age = t - s.at;
      const bend = s.amp * Math.exp(-age * 5.2) * Math.cos(age * 2 * Math.PI * 9);
      if (Math.abs(s.amp * Math.exp(-age * 5.2)) < 0.06) { s.amp = 0; draw(s, 0); continue; }
      ringing++;
      draw(s, bend);
    }
  });
}
