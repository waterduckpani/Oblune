import type { RepoBrowser, RepoData } from './browser';
import type { Scope } from '../scope';

/**
 * Opening repositories inside the site. Anything with [data-repo-open="slug"] opens that repo in a
 * window that grows out of the button; [data-repo-inline="slug"] hosts one in the page itself.
 * The browser, its data and the highlighter all load on first use, so none of it costs the page.
 * Links look like #code/mull or #code/mull/lib/core/money.dart:L12.
 */
const repos = import.meta.glob<RepoData>('../../data/repos/*.json', { import: 'default' });
const load = async (slug: string) => {
  const [data, mod] = await Promise.all([repos[`../../data/repos/${slug}.json`]!(), import('./browser')]);
  // each window gets its own copy, since the live check may update it
  return { data: structuredClone(data), RepoBrowser: mod.RepoBrowser };
};
export const hasRepo = (slug: string) => !!repos[`../../data/repos/${slug}.json`];

type Hooks = { onOpen?: () => void; onClose?: () => void };

export function initRepos(hooks: Hooks = {}) {
  const dialog = document.querySelector<HTMLDialogElement>('[data-repo-dialog]');
  const win = dialog?.querySelector<HTMLElement>('[data-repo-win]');
  const host = dialog?.querySelector<HTMLElement>('[data-repo-host]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let modal: { slug: string; browser: RepoBrowser } | null = null;
  let origin: Element | null = null;
  let closing = false;

  const route = (slug: string | null, path: string | null) => {
    const hash = slug ? `#code/${slug}${path ? `/${path}` : ''}` : '';
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  };

  const clipFrom = (el: Element | null) => {
    if (!el || !win) return 'inset(0 round 18px)';
    const r = el.getBoundingClientRect(), w = win.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return `inset(40% 40% 40% 40% round 999px)`;
    const t = Math.max(0, r.top - w.top), l = Math.max(0, r.left - w.left);
    const b = Math.max(0, w.bottom - r.bottom), rt = Math.max(0, w.right - r.right);
    return `inset(${t}px ${rt}px ${b}px ${l}px round ${Math.min(r.height / 2, 999)}px)`;
  };

  async function openModal(slug: string, path: string | null = null, from: Element | null = null, line?: number) {
    if (!dialog || !host || !win || !hasRepo(slug)) return;
    origin = from;
    if (modal?.slug !== slug) {
      host.innerHTML = '<div class="rbd__wait"><i></i></div>';
      if (!dialog.open) show();
      const { data, RepoBrowser } = await load(slug);
      modal = {
        slug,
        browser: new RepoBrowser(host, data, {
          slug, mode: 'modal',
          onClose: () => closeModal(),
          onRoute: (p) => route(slug, p),
        }),
      };
    } else if (!dialog.open) show();
    if (path) modal.browser.openFile(path, line);
    else route(slug, null);
    requestAnimationFrame(() => modal?.browser.el.querySelector<HTMLElement>('.rb__node, [data-rb="find"]')?.focus({ preventScroll: true }));
  }

  function show() {
    if (!dialog || !win) return;
    dialog.showModal();
    document.documentElement.classList.add('is-modal');
    hooks.onOpen?.();
    if (reduced) return;
    win.animate(
      [{ clipPath: clipFrom(origin), transform: 'scale(0.985)', opacity: 0.6 }, { clipPath: 'inset(0 round 18px)', transform: 'none', opacity: 1 }],
      { duration: 760, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, pseudoElement: '::backdrop' });
  }

  async function closeModal() {
    if (!dialog?.open || !win || closing) return;
    closing = true;
    route(null, null);
    if (!reduced) {
      const a = win.animate(
        [{ clipPath: 'inset(0 round 18px)', opacity: 1 }, { clipPath: clipFrom(origin), opacity: 0 }],
        { duration: 520, easing: 'cubic-bezier(0.7, 0, 0.84, 0)' },
      );
      dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, pseudoElement: '::backdrop' });
      await a.finished.catch(() => {});
    }
    dialog.close();
    document.documentElement.classList.remove('is-modal');
    hooks.onClose?.();
    (origin as HTMLElement | null)?.focus?.({ preventScroll: true });
    closing = false;
  }

  dialog?.addEventListener('cancel', (e) => {
    // Escape closes the finder first, if it is open
    if (modal && !modal.browser.el.querySelector<HTMLElement>('[data-rb-finder]')!.hidden) { e.preventDefault(); return; }
    e.preventDefault();
    closeModal();
  });
  dialog?.addEventListener('click', (e) => { if (e.target === dialog) closeModal(); });

  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-repo-open]');
    if (!b) return;
    e.preventDefault();
    openModal(b.dataset.repoOpen!, b.dataset.repoPath ?? null, b);
  });

  /** Inline browsers in a page mount as they come near, and go with the page. */
  function mountInline(root: ParentNode, scope: Scope) {
    const io = scope.observe(new IntersectionObserver((entries) => {
      entries.forEach(async (en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target as HTMLElement;
        const slug = el.dataset.repoInline!;
        const { data, RepoBrowser } = await load(slug);
        if (scope.dead) return;
        new RepoBrowser(el, data, {
          slug, mode: 'inline',
          onExpand: (p) => openModal(slug, p, el),
        });
      });
    }, { rootMargin: '800px 0px' }));
    root.querySelectorAll<HTMLElement>('[data-repo-inline]').forEach((el) => io.observe(el));
  }

  /** Opens whatever the address asks for, e.g. #code/mull/lib/core/money.dart:L12 */
  function fromHash() {
    const m = /^#code\/([\w-]+)(?:\/(.+?))?(?::L(\d+))?$/.exec(decodeURIComponent(location.hash));
    if (m && hasRepo(m[1])) openModal(m[1], m[2] ?? null, null, m[3] ? Number(m[3]) : undefined);
  }
  addEventListener('hashchange', fromHash);

  return { openModal, closeModal, fromHash, mountInline };
}
