import { sound } from './audio';

/**
 * Ask once, at the door. Resolves when the visitor has entered (with sound, or without), or at
 * once if no asking is needed: sound already playing, or turned off before. The choice is made
 * inside the click or key press itself, which is the only moment a browser lets audio begin.
 */
let asked: Promise<void> | null = null;
let need: Promise<boolean> | null = null;

/** true if the browser is holding the sound back until a gesture. */
export function needsEnter() {
  need ??= sound.probe().then((running) => !running && sound.wanted);
  return need;
}

export function enter(variant: 'veil' | 'loader'): Promise<void> {
  if (asked) return asked;
  asked = needsEnter().then((needed) => {
    const el = document.querySelector<HTMLElement>('[data-enter]');
    if (!needed || !el) return;
    const go = el.querySelector<HTMLButtonElement>('[data-enter-go]')!;
    const quiet = el.querySelector<HTMLButtonElement>('[data-enter-quiet]')!;
    el.dataset.variant = variant;
    el.hidden = false;
    document.documentElement.classList.add('is-entering');
    requestAnimationFrame(() => { el.dataset.on = 'true'; go.focus({ preventScroll: true }); });
    return new Promise<void>((done) => {
      let over = false;
      const finish = (withSound: boolean) => {
        if (over) return;
        over = true;
        if (withSound) sound.enable(); else sound.disable();
        removeEventListener('keydown', onKey, true);
        el.dataset.on = 'false';
        document.documentElement.classList.remove('is-entering');
        setTimeout(() => { el.hidden = true; }, 700);
        done();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(true); }
      };
      go.addEventListener('click', () => finish(true), { once: true });
      quiet.addEventListener('click', () => finish(false), { once: true });
      // anywhere on the veil but the quiet link enters with sound
      el.addEventListener('click', (e) => { if (e.target === el) finish(true); });
      addEventListener('keydown', onKey, true);
    });
  });
  return asked;
}
