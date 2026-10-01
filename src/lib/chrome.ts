import { gsap } from 'gsap';
import type Lenis from 'lenis';
import { emblemPath } from './phase';
import { sound } from './audio';

export type Go = { href: string; label: string; external?: boolean; live?: string };

/**
 * The chrome that lives for the whole visit: the island (where you are, the way out of it, the
 * menu), the sound toggle and its bars, and the small sounds for hover and press. Pages tell it
 * where you are with `setNow`; it never needs to be rebuilt.
 */
export function initChrome(opts: { lenis: Lenis | null; reduced: boolean }) {
  const { reduced } = opts;
  const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const qa = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

  // ---------- Sound ----------
  const HOVERABLE = 'a, button, label.brief__kind';
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as Element).closest(HOVERABLE);
    const from = (e.relatedTarget as Element | null)?.closest?.(HOVERABLE);
    if (t && t !== from) sound.tick();
  });
  document.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest(HOVERABLE)) sound.tap(); });
  const soundLabel = qa('[data-sound-label]');
  const hint = document.querySelector<HTMLElement>('[data-sound-hint], [data-sound-start]');
  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest('[data-sound-toggle], [data-sound-start]');
    if (!t) return;
    e.stopPropagation();
    if ((t as HTMLElement).dataset.soundStart !== undefined) sound.enable(); else sound.toggle();
  });
  const paint = (on: boolean) => {
    qa('[data-sound-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
    soundLabel.forEach((l) => (l.textContent = on ? 'Sound on' : 'Sound off'));
    document.documentElement.dataset.sound = String(on);
    // wanted but not yet allowed to play: say how to start it
    if (hint) hint.dataset.on = String(on && !sound.running && !reduced && armedHint);
  };
  let armedHint = false;
  sound.onChange(paint);
  /** Arm the sound for this visit; a small note says it starts with a click, if it has not already. */
  function armSound() {
    sound.arm();
    gsap.delayedCall(2.2, () => { armedHint = true; paint(sound.on); });
    gsap.delayedCall(9, () => { armedHint = false; paint(sound.on); });
  }
  // the bars move with what is actually playing (and rest when nothing is)
  const bars = qa('[data-sound-bars] i');
  const levels = [0, 0, 0, 0, 0];
  const shown = [0, 0, 0, 0, 0];
  gsap.ticker.add(() => {
    sound.levels(levels);
    for (let i = 0; i < 5; i++) {
      const v = 0.18 + Math.min(1, levels[i] * 1.6) * 0.82;
      if (Math.abs(v - shown[i]) < 0.01) continue;
      shown[i] = v;
      bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
    }
  });

  // ---------- The island ----------
  const nav = q('[data-nav]');
  const navMoon = document.querySelector<SVGPathElement>('[data-nav-moon]');
  const island = q('[data-island]');
  const bar = q('[data-island-bar]');
  const islandToggle = q<HTMLButtonElement>('[data-island-toggle]');
  const islandPanel = q('[data-island-panel]');
  const islandGlyph = q<SVGPathElement>('[data-island-glyph]');
  const islandProgress = q<SVGCircleElement>('[data-island-progress]');
  const islandGo = q<HTMLAnchorElement>('[data-island-go]');
  const islandGoLabel = q('[data-island-go-label]');
  const now = q('[data-now]');
  const sizeIsland = () => island.style.setProperty('--w', `${Math.ceil(bar.getBoundingClientRect().width)}px`);

  function openIsland() {
    island.dataset.open = 'true';
    islandToggle.setAttribute('aria-expanded', 'true');
    islandPanel.removeAttribute('inert');
    island.style.setProperty('--h', `${islandPanel.scrollHeight + 58}px`);
    tickClock();
    sound.whoosh(true);
    if (reduced) return;
    gsap.fromTo(islandPanel.querySelectorAll('.menu__li, .menu__k, .menu__foot'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.025, delay: 0.12, overwrite: true });
  }
  function closeIsland() {
    if (island.dataset.open !== 'true') return;
    island.dataset.open = 'false';
    islandToggle.setAttribute('aria-expanded', 'false');
    islandPanel.setAttribute('inert', '');
    sound.whoosh(false);
  }
  islandToggle.addEventListener('click', () => (island.dataset.open === 'true' ? closeIsland() : openIsland()));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeIsland(); });
  document.addEventListener('pointerdown', (e) => { if (!island.contains(e.target as Node)) closeIsland(); });

  // the menu: hovering a project shows it on the card beside the list
  const cards = qa('[data-card]');
  let cardNow = 'studio';
  const showCard = (k: string) => {
    if (k === cardNow || !cards.some((c) => c.dataset.card === k)) return;
    cardNow = k;
    cards.forEach((c) => (c.dataset.on = String(c.dataset.card === k)));
  };
  qa<HTMLAnchorElement>('[data-menu-item]').forEach((a) => {
    const k = a.dataset.menuItem!;
    a.addEventListener('pointerenter', () => showCard(k));
    a.addEventListener('focus', () => showCard(k));
  });
  islandPanel.addEventListener('pointerleave', () => showCard('studio'));
  const clock = document.querySelector<HTMLElement>('[data-menu-clock]');
  function tickClock() {
    if (!clock) return;
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date());
    clock.textContent = `New Delhi, ${t} · open to new work`;
  }

  /** Home or a case page: the menu's projects lead to their chapter at home, or their case study. */
  function setMode(mode: 'home' | 'case', current?: string) {
    qa<HTMLAnchorElement>('[data-home-href]').forEach((a) => {
      a.href = mode === 'home' ? a.dataset.homeHref! : a.dataset.awayHref!;
      a.setAttribute('aria-current', String(a.dataset.menuItem === current));
    });
  }

  // ---------- Scroll: the brand and the end buttons step aside while you read ----------
  let lastY = scrollY;
  let raf = 0;
  const onScroll = () => {
    raf = 0;
    const y = scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (y > lastY + 2 && y > innerHeight * 0.5) nav.dataset.hidden = 'true';
    else if (y < lastY - 2 || y < innerHeight * 0.5) nav.dataset.hidden = 'false';
    const deep = String(y > innerHeight * 0.6);
    if (nav.dataset.deep !== deep) nav.dataset.deep = deep;
    islandProgress.style.strokeDashoffset = (1 - Math.min(1, y / max)).toFixed(4);
    lastY = y;
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });

  const navPhase = { lit: 0.75 };
  if (navMoon) {
    const drawNav = () => navMoon.setAttribute('d', emblemPath(navPhase.lit));
    q('.nav__brand').addEventListener('pointerenter', () => {
      if (reduced) return;
      gsap.timeline()
        .to(navPhase, { lit: 0, duration: 0.45, ease: 'power2.in', onUpdate: drawNav, overwrite: true })
        .to(navPhase, { lit: 1, duration: 0.8, ease: 'power2.inOut', onUpdate: drawNav })
        .to(navPhase, { lit: 0.75, duration: 0.5, ease: 'power2.out', onUpdate: drawNav });
    });
  }

  let nowKey = '';
  const islandLit = { v: 0.75 };
  /** Say where you are: a label, the moon at that phase, and an optional way out. */
  function setNow(label: string, lit: number, go: Go | null = null) {
    const key = `${label}|${go?.href ?? ''}|${go?.label ?? ''}`;
    if (key === nowKey) return;
    nowKey = key;
    gsap.to(islandLit, { v: lit, duration: 0.9, ease: 'power3.inOut', overwrite: true, onUpdate: () => islandGlyph.setAttribute('d', emblemPath(islandLit.v)) });
    const apply = () => {
      now.textContent = label;
      const had = !islandGo.hidden;
      island.dataset.live = String(!!go);
      islandGo.hidden = !go;
      if (go) {
        islandGo.href = go.href;
        islandGoLabel.textContent = go.label;
        if (go.live) islandGo.dataset.liveOpen = go.live; else delete islandGo.dataset.liveOpen;
        if (go.external) { islandGo.target = '_blank'; islandGo.rel = 'noopener'; } else { islandGo.removeAttribute('target'); islandGo.removeAttribute('rel'); }
        if (!had && !reduced) { islandGo.classList.remove('is-in'); void islandGo.offsetWidth; islandGo.classList.add('is-in'); }
      }
      sizeIsland();
    };
    if (reduced) { apply(); return; }
    gsap.timeline()
      .to(now, { yPercent: -110, duration: 0.28, ease: 'power2.in' })
      .add(apply)
      .fromTo(now, { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: 'expo.out' });
  }

  addEventListener('resize', sizeIsland);
  document.fonts?.ready.then(sizeIsland);
  sizeIsland();

  return { setNow, setMode, closeIsland, sizeIsland, island, nav, armSound };
}
export type Chrome = ReturnType<typeof initChrome>;
