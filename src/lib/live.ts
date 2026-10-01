/**
 * The live products, opened running in a window over the page. [data-live-open="slug"] opens it;
 * the link keeps its real href, so a middle click or ⌘-click still opens the site in a new tab.
 *
 * Only sites that allow being framed are listed (`embed: true` in the project data). The rest send
 * X-Frame-Options: DENY, and a capture would only misrepresent them, so their links are plain
 * links to the real site. Set `embed: true` once a site allows frame-ancestors oblunestudio.com.
 */
type Live = { name: string; href: string; host: string; label: string };
type Hooks = { onOpen?: () => void; onClose?: () => void };

export function initLive(hooks: Hooks = {}) {
  const dialog = document.querySelector<HTMLDialogElement>('[data-live-dialog]');
  if (!dialog) return { open: () => {} };
  const data = JSON.parse(document.querySelector('[data-live-data]')?.textContent ?? '{}') as Record<string, Live>;
  const win = dialog.querySelector<HTMLElement>('[data-live-win]')!;
  const body = dialog.querySelector<HTMLElement>('[data-live-body]')!;
  const host = dialog.querySelector<HTMLElement>('[data-live-host]')!;
  const out = dialog.querySelector<HTMLAnchorElement>('[data-live-out]')!;
  const devices = [...dialog.querySelectorAll<HTMLButtonElement>('[data-live-device]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur: Live | null = null;
  let device: 'desktop' | 'phone' = 'desktop';
  let origin: Element | null = null;
  let closing = false;

  const clipFrom = (el: Element | null) => {
    if (!el) return 'inset(40% 40% 40% 40% round 999px)';
    const r = el.getBoundingClientRect(), w = win.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) return 'inset(40% 40% 40% 40% round 999px)';
    const t = Math.max(0, r.top - w.top), l = Math.max(0, r.left - w.left);
    const b = Math.max(0, w.bottom - r.bottom), rt = Math.max(0, w.right - r.right);
    return `inset(${t}px ${rt}px ${b}px ${l}px round ${Math.min(r.height / 2, 999)}px)`;
  };

  function frame(src: string) {
    const f = document.createElement('iframe');
    f.className = 'lw__frame';
    f.src = src;
    f.title = `${cur!.host}, live`;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox');
    return f;
  }
  function render() {
    if (!cur) return;
    dialog!.dataset.device = device;
    devices.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.liveDevice === device)));
    body.innerHTML = '';
    const content = frame(cur.href);
    const wait = document.createElement('p');
    wait.className = 'lw__loading';
    wait.textContent = `Loading ${cur.host}`;
    content.addEventListener('load', () => { wait.style.opacity = '0'; });
    if (device === 'phone') {
      const phone = document.createElement('div'); phone.className = 'lw__phone';
      const screen = document.createElement('div'); screen.className = 'lw__screen';
      screen.append(content, wait); phone.append(screen); body.append(phone);
      // a real phone's viewport, scaled into the frame
      requestAnimationFrame(() => { content.style.transform = `scale(${screen.clientWidth / 402})`; });
    } else body.append(content, wait);
  }

  function open(slug: string, from: Element | null = null) {
    const d = data[slug];
    if (!d) return false;
    cur = d;
    origin = from;
    device = matchMedia('(max-width: 860px)').matches ? 'phone' : 'desktop';
    host.textContent = d.host;
    out.href = d.href;
    render();
    dialog!.showModal();
    document.documentElement.classList.add('is-modal');
    hooks.onOpen?.();
    if (!reduced) {
      win.animate(
        [{ clipPath: clipFrom(origin), transform: 'scale(0.985)', opacity: 0.6 }, { clipPath: 'inset(0 round 18px)', transform: 'none', opacity: 1 }],
        { duration: 760, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
      dialog!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, pseudoElement: '::backdrop' });
    }
    return true;
  }

  async function close() {
    if (!dialog!.open || closing) return;
    closing = true;
    if (!reduced) {
      const a = win.animate([{ clipPath: 'inset(0 round 18px)', opacity: 1 }, { clipPath: clipFrom(origin), opacity: 0 }], { duration: 520, easing: 'cubic-bezier(0.7, 0, 0.84, 0)' });
      dialog!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, pseudoElement: '::backdrop' });
      await a.finished.catch(() => {});
    }
    dialog!.close();
    body.innerHTML = '';
    document.documentElement.classList.remove('is-modal');
    hooks.onClose?.();
    (origin as HTMLElement | null)?.focus?.({ preventScroll: true });
    closing = false;
  }

  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.querySelector('[data-live-close]')!.addEventListener('click', close);
  dialog.querySelector('[data-live-reload]')!.addEventListener('click', render);
  devices.forEach((b) => b.addEventListener('click', () => { device = b.dataset.liveDevice as 'desktop' | 'phone'; render(); }));
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const t = (e.target as Element).closest<HTMLElement>('[data-live-open]');
    if (!t || !data[t.dataset.liveOpen!]) return;
    e.preventDefault();
    open(t.dataset.liveOpen!, t);
  });

  return { open, close };
}
