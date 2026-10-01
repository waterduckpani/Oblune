import { gsap } from 'gsap';
import { emblemPath } from './phase';

export type CurtainText = { title: string; kicker?: string; lit?: number };
/** A held screen: the curtain takes over a screen already showing this, in these colours. */
export type Held = CurtainText & { bg: string; ink: string };

const esc = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chars = (s: string) => [...s].map((c) => `<span class="c">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');

/**
 * The curtain between pages. `cover` resolves once the screen is fully covered, so the page
 * underneath can be swapped; `reveal` sweeps it off the far side.
 */
export function createCurtain(reduced: boolean) {
  const root = document.querySelector<HTMLElement>('[data-curtain]')!;
  const sheet = root.querySelector<HTMLElement>('[data-curtain-sheet]')!;
  const title = root.querySelector<HTMLElement>('[data-curtain-title]')!;
  const kicker = root.querySelector<HTMLElement>('[data-curtain-kicker]')!;
  const moon = root.querySelector<SVGPathElement>('[data-curtain-moon]')!;
  const arc = root.querySelector<SVGCircleElement>('[data-curtain-arc]')!;
  const status = document.querySelector<HTMLElement>('[data-route-status]');
  const phase = { lit: 0 };
  const draw = () => moon.setAttribute('d', emblemPath(Math.max(0.001, phase.lit)));
  let covered = false;
  let wax: gsap.core.Tween | null = null;

  function cover(t: CurtainText, fast = false): Promise<void> {
    gsap.killTweensOf([sheet, phase, arc]);
    title.innerHTML = chars(t.title);
    kicker.innerHTML = t.kicker ? chars(t.kicker) : '';
    if (status) status.textContent = `Loading ${t.title}`;
    root.dataset.on = 'true';
    const lit = t.lit ?? 0.75;
    const letters = [...title.querySelectorAll('.c'), ...kicker.querySelectorAll('.c')];
    if (reduced) {
      phase.lit = lit; draw();
      gsap.set(sheet, { clipPath: 'none', opacity: 0 });
      covered = true;
      return new Promise<void>((r) => { gsap.to(sheet, { opacity: 1, duration: 0.2, onComplete: () => r() }); });
    }
    phase.lit = 0; draw();
    gsap.set(arc, { strokeDashoffset: 1 });
    // the moon waxes toward the phase of where you are going, and the ring fills while you wait
    wax = gsap.to(phase, { lit, duration: fast ? 0.9 : 1.3, ease: 'power2.inOut', onUpdate: draw });
    gsap.to(arc, { strokeDashoffset: 0.12, duration: 2.4, ease: 'power1.out' });
    const d = fast ? 0.6 : 0.85;
    const tl = gsap.timeline();
    tl.fromTo(sheet, { clipPath: 'ellipse(0% 105% at 100% 50%)', opacity: 1 }, { clipPath: 'ellipse(125% 105% at 100% 50%)', duration: d, ease: 'power3.inOut' }, 0);
    tl.fromTo(letters, { yPercent: 115 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.022 }, d * 0.45);
    return new Promise((res) => { tl.call(() => { covered = true; res(); }, [], d); });
  }

  /**
   * Take over a screen that already shows the destination (the end of a case study, filled with the
   * next one's colour and name): the curtain appears in exactly that state, with no movement, so
   * the page can be swapped beneath it unseen.
   */
  function hold(t: Held) {
    gsap.killTweensOf([sheet, phase, arc]);
    title.innerHTML = chars(t.title);
    kicker.innerHTML = t.kicker ? chars(t.kicker) : '';
    if (status) status.textContent = `Loading ${t.title}`;
    sheet.style.background = t.bg;
    sheet.style.color = t.ink;
    kicker.style.color = `color-mix(in srgb, ${t.ink} 55%, transparent)`;
    root.dataset.on = 'true';
    phase.lit = t.lit ?? 0.75; draw();
    gsap.set(arc, { strokeDashoffset: 0.12 });
    gsap.set(sheet, { clipPath: 'none', opacity: 1 });
    gsap.set([...title.querySelectorAll('.c'), ...kicker.querySelectorAll('.c')], { yPercent: 0 });
    covered = true;
  }
  const unhold = () => { sheet.style.background = ''; sheet.style.color = ''; kicker.style.color = ''; };

  function reveal(fast = false): Promise<void> {
    if (!covered) { root.dataset.on = 'false'; return Promise.resolve(); }
    covered = false;
    if (status) status.textContent = '';
    wax?.progress(1);
    gsap.to(arc, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' });
    if (reduced) {
      return new Promise<void>((r) => { gsap.to(sheet, { opacity: 0, duration: 0.25, onComplete: () => { root.dataset.on = 'false'; unhold(); r(); } }); });
    }
    const letters = [...title.querySelectorAll('.c'), ...kicker.querySelectorAll('.c')];
    const tl = gsap.timeline();
    tl.to(letters, { yPercent: -115, duration: 0.5, ease: 'power3.in', stagger: 0.012 }, 0);
    // the lit side comes back across from the right, so night leaves by the left
    tl.fromTo(sheet, { clipPath: 'ellipse(125% 105% at 0% 50%)' }, { clipPath: 'ellipse(0% 105% at 0% 50%)', duration: fast ? 0.7 : 0.95, ease: 'power3.inOut' }, fast ? 0.12 : 0.22);
    return new Promise((res) => tl.call(() => { root.dataset.on = 'false'; unhold(); res(); }));
  }

  return { cover, hold, reveal, get covered() { return covered; } };
}
export type Curtain = ReturnType<typeof createCurtain>;
