import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { app, type PageHandle, type PageModule } from './app';
import { Scope } from './scope';
import { createCurtain, type CurtainText, type Held } from './curtain';
import { sound } from './audio';
import { wave, fillFrom, copyEmail, magnetic } from './fx';

/**
 * Page to page without a reload. The next page is fetched (usually already, on hover), night
 * crosses the screen, the old page is taken down and the new one mounted under cover, and the
 * curtain lifts. The sound, the nav and the scroll carry on throughout, and back and forward
 * work as they should, returning you to where you were.
 */
const PAGES: Record<string, () => Promise<PageModule>> = {
  home: () => import('../scripts/home'),
  case: () => import('../scripts/case'),
};

type Where = CurtainText & { key?: string };
const routes: Record<string, Where> = (() => {
  try { return JSON.parse(document.querySelector('[data-routes]')?.textContent ?? '{}'); } catch { return {}; }
})();
const clean = (u: URL) => u.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise<void>((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });

export function createRouter() {
  const curtain = createCurtain(app.reduced);
  const cache = new Map<string, Promise<string>>();
  let page: PageHandle = {};
  let scope: Scope | null = null;
  let busy = false;
  let queued: { url: string; pop: boolean; y?: number } | null = null;
  let path = clean(new URL(location.href));

  history.scrollRestoration = 'manual';

  const fetchPage = (p: string) => {
    let f = cache.get(p);
    if (!f) {
      f = fetch(p, { headers: { Accept: 'text/html' } }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); });
      f.catch(() => cache.delete(p));
      cache.set(p, f);
    }
    return f;
  };

  const view = () => document.querySelector<HTMLElement>('[data-view]')!;

  /** Where a link goes, in words, for the curtain. */
  function describe(u: URL): Where {
    if (u.hash && clean(u) === '/' && routes[u.hash]) return routes[u.hash];
    return routes[clean(u)] ?? { title: 'Oblune Studio', kicker: '' };
  }

  async function mount(first: boolean) {
    const v = view();
    scope = new Scope();
    // the small behaviours every page's buttons and labels share
    wave(v); fillFrom(v); copyEmail(v);
    if (!app.coarse && !app.reduced) magnetic(v);
    const mod = await PAGES[v.dataset.page ?? 'home']();
    page = await mod.mount({ scope, view: v, first });
  }

  function unmount() {
    try { page.destroy?.(); } catch (e) { console.error(e); }
    scope?.kill();
    scope = null;
    page = {};
    // anything a page left on the scroll is gone with it
    ScrollTrigger.getAll().forEach((t) => t.kill());
  }

  /** Brings in the new page's styles (waiting for them) before its markup, then drops the old page's. */
  async function swapHead(doc: Document) {
    const key = (el: Element) => {
      if (el instanceof HTMLLinkElement && el.rel === 'stylesheet') return `L${el.getAttribute('href')}`;
      if (el instanceof HTMLStyleElement) return `S${el.getAttribute('data-vite-dev-id') ?? el.textContent}`;
      return null;
    };
    const have = new Map<string, Element>();
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => { const k = key(el); if (k) have.set(k, el); });
    const want = new Set<string>();
    const loads: Promise<unknown>[] = [];
    doc.head.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
      const k = key(el);
      if (!k) return;
      want.add(k);
      if (have.has(k)) return;
      const n = document.importNode(el, true) as HTMLElement;
      if (n instanceof HTMLLinkElement) loads.push(new Promise((r) => { n.onload = n.onerror = r; setTimeout(r, 4000); }));
      document.head.append(n);
    });
    await Promise.all(loads);
    // metadata
    document.title = doc.title;
    const sel = 'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]';
    document.head.querySelectorAll(sel).forEach((m) => m.remove());
    const anchor = document.head.querySelector('title');
    doc.head.querySelectorAll(sel).forEach((m) => anchor?.after(document.importNode(m, true)));
    return () => have.forEach((el, k) => { if (!want.has(k)) el.remove(); });
  }

  async function go(url: string, opts: { pop?: boolean; y?: number; held?: Held } = {}) {
    if (busy) { queued = { url, pop: !!opts.pop, y: opts.y }; return; }
    const u = new URL(url, location.href);
    const next = clean(u);
    busy = true;
    const html = fetchPage(u.pathname);
    if (!opts.pop) history.replaceState({ ...(history.state ?? {}), y: scrollY }, '');
    app.chrome.closeIsland();
    app.lenis?.stop();
    sound.whoosh(true);
    const where = describe(u);
    try {
      if (opts.held) curtain.hold(opts.held);
      else await curtain.cover(where);
      const text = await html;
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const incoming = doc.querySelector<HTMLElement>('[data-view]');
      if (!incoming) throw new Error('no view');
      const dropOld = await swapHead(doc);
      unmount();
      const root = document.documentElement;
      delete root.dataset.night;
      root.classList.remove('is-ready', 'is-modal');
      root.classList.add('quick');
      view().replaceWith(document.importNode(incoming, true));
      dropOld();
      if (!opts.pop) history.pushState({ y: 0 }, '', u.pathname + u.search + u.hash);
      path = next;
      app.lenis?.scrollTo(0, { immediate: true, force: true });
      scrollTo(0, 0);
      await mount(false);
      await frames(1);
      ScrollTrigger.refresh();
      app.lenis?.resize();
      const y = opts.y ?? (u.hash ? targetY(u.hash) : 0);
      if (y) { app.lenis?.scrollTo(y, { immediate: true, force: true }); if (!app.lenis) scrollTo(0, y); }
      await frames(2);
      // a moment for the new page's first frame to settle behind the curtain
      await wait(120);
      app.lenis?.start();
      const lift = curtain.reveal();
      page.intro?.();
      await lift;
    } catch (err) {
      console.warn('Falling back to a full page load', err);
      location.href = u.href;
      return;
    } finally {
      busy = false;
    }
    if (queued) { const q = queued; queued = null; go(q.url, { pop: q.pop, y: q.y }); }
  }

  function targetY(hash: string) {
    const t = page.target?.(hash) ?? defaultTarget(hash);
    if (!t) return 0;
    return Math.max(0, t.el.getBoundingClientRect().top + scrollY + (t.offset ?? 0));
  }
  function defaultTarget(hash: string): { el: Element; offset?: number; label?: string } | null {
    if (hash === '#' || hash === '#top') return { el: document.body, offset: 0 };
    try { const el = document.querySelector(hash); return el ? { el, offset: -88 } : null; } catch { return null; }
  }

  /** Within the page: glide if it is near, and cross under the curtain if it is far. */
  async function jump(hash: string) {
    const y = targetY(hash);
    const t = page.target?.(hash) ?? defaultTarget(hash);
    if (!t) return false;
    app.chrome.closeIsland();
    const dist = Math.abs(y - scrollY);
    if (!app.lenis || app.reduced) { scrollTo({ top: y, behavior: app.reduced ? 'auto' : 'smooth' }); return true; }
    if (dist < innerHeight * 1.6) {
      app.lenis.scrollTo(y, { duration: Math.min(1.5, 0.9 + dist / 2400), easing: (x) => 1 - Math.pow(1 - x, 4), force: true });
      return true;
    }
    if (busy) return true;
    busy = true;
    const where = routes[hash] ?? { title: t.label ?? 'Oblune Studio', kicker: '' };
    sound.whoosh(true);
    app.lenis.stop();
    await curtain.cover(where, true);
    app.lenis.scrollTo(y, { immediate: true, force: true });
    await frames(3);
    await wait(160);
    app.lenis.start();
    await curtain.reveal(true);
    busy = false;
    return true;
  }

  function onClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.('a');
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download') || a.dataset.router === 'off') return;
    if (a.closest('.rb')) return; // the code browser keeps its own links
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    const same = clean(u) === path;
    if (same && u.hash) { e.preventDefault(); jump(u.hash); return; }
    if (same && !u.hash) { e.preventDefault(); jump('#top'); return; }
    e.preventDefault();
    go(u.href);
  }

  function prefetch(e: Event) {
    const a = (e.target as Element).closest?.('a');
    if (!a || !a.href || a.target === '_blank') return;
    const u = new URL(a.href, location.href);
    if (u.origin === location.origin && clean(u) !== path) fetchPage(u.pathname).catch(() => {});
  }

  document.addEventListener('click', onClick);
  document.addEventListener('pointerover', prefetch, { passive: true });
  document.addEventListener('focusin', prefetch);
  document.addEventListener('touchstart', prefetch, { passive: true });
  addEventListener('popstate', (e) => {
    const u = new URL(location.href);
    if (clean(u) === path) { if (u.hash && !u.hash.startsWith('#code/')) jump(u.hash); return; }
    go(u.href, { pop: true, y: (e.state as { y?: number } | null)?.y ?? 0 });
  });

  async function start() {
    history.replaceState({ y: 0 }, '');
    await mount(true);
  }

  return { start, go, jump, get page() { return page; }, get busy() { return busy; } };
}
export type Router = ReturnType<typeof createRouter>;
