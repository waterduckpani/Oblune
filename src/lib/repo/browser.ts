import { highlight, langOf } from './highlight';
import iFolder from '@phosphor-icons/core/assets/light/folder-simple-light.svg?raw';
import iFolderOpen from '@phosphor-icons/core/assets/light/folder-open-light.svg?raw';
import iFile from '@phosphor-icons/core/assets/light/file-text-light.svg?raw';
import iImage from '@phosphor-icons/core/assets/light/image-light.svg?raw';
import iSearch from '@phosphor-icons/core/assets/light/magnifying-glass-light.svg?raw';
import iCommit from '@phosphor-icons/core/assets/light/git-commit-light.svg?raw';
import iBranch from '@phosphor-icons/core/assets/light/git-branch-light.svg?raw';
import iStar from '@phosphor-icons/core/assets/light/star-light.svg?raw';
import iClose from '@phosphor-icons/core/assets/light/x-light.svg?raw';
import iOut from '@phosphor-icons/core/assets/light/arrow-up-right-light.svg?raw';
import iList from '@phosphor-icons/core/assets/light/list-light.svg?raw';
import iBook from '@phosphor-icons/core/assets/light/book-open-text-light.svg?raw';
import iCopy from '@phosphor-icons/core/assets/light/copy-light.svg?raw';
import iExpand from '@phosphor-icons/core/assets/light/arrows-out-simple-light.svg?raw';
import iGithub from '@phosphor-icons/core/assets/light/github-logo-light.svg?raw';

export type RepoData = {
  owner: string;
  name: string;
  branch: string;
  description: string;
  homepage: string | null;
  stars: number;
  forks: number;
  license: string;
  pushedAt: string;
  createdAt: string;
  commitCount: number;
  truncated: boolean;
  languages: [string, number][];
  commits: { sha: string; message: string; date: string }[];
  readmePath: string | null;
  readme: string;
  files: ([string, 'd'] | [string, 'f', number])[];
  snapshotAt: string;
};

type Node = { name: string; path: string; dir: boolean; size: number; kids: Node[] };
type Opts = {
  slug: string;
  mode: 'modal' | 'inline';
  onClose?: () => void;
  onExpand?: (path: string | null) => void;
  /** Called whenever the open file changes, so the page can keep a shareable link. */
  onRoute?: (path: string | null) => void;
};

const icon = (svg: string, cls = 'rb__i') => svg.replace('<svg ', `<svg aria-hidden="true" class="${cls}" fill="currentColor" `);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|icns|bmp|tiff?|pdf|mp4|mov|webm|mp3|wav|m4a|ttf|otf|woff2?|zip|gz|tar|jar|keystore|jks|p12|mobileprovision|a|so|dylib|bin|pbxproj\.lock|sqlite|db)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i;
const LANG_COLOURS = ['#e8e9ec', '#a9c6e3', '#d9c7a0', '#b9d3ae', '#e6a79e', '#c9b3e0', '#8a8c93'];
const MAX_TEXT = 400_000;

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const f = (n: number, u: string) => `${Math.max(1, Math.round(n))} ${u}${Math.round(n) === 1 ? '' : 's'} ago`;
  if (s < 3600) return f(s / 60, 'minute');
  if (s < 86400) return f(s / 3600, 'hour');
  if (s < 86400 * 30) return f(s / 86400, 'day');
  if (s < 86400 * 365) return f(s / (86400 * 30), 'month');
  return f(s / (86400 * 365), 'year');
}
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** A subsequence match, scored so contiguous runs and hits in the file name rank first. */
function fuzzy(q: string, path: string): number {
  const p = path.toLowerCase();
  const base = p.lastIndexOf('/') + 1;
  let score = 0, run = 0, j = 0;
  for (let i = 0; i < p.length && j < q.length; i++) {
    if (p[i] === q[j]) { run++; score += 1 + run * 2 + (i >= base ? 3 : 0) + (i === base ? 6 : 0); j++; } else run = 0;
  }
  if (j < q.length) return -1;
  // a contiguous hit beats a scattered one, and one in the file name beats one in the folders
  if (p.slice(base).includes(q)) score += 60; else if (p.includes(q)) score += 30;
  return score - p.length * 0.02;
}

function buildTree(files: RepoData['files']): Node {
  const root: Node = { name: '', path: '', dir: true, size: 0, kids: [] };
  const dirs = new Map<string, Node>([['', root]]);
  const ensure = (path: string): Node => {
    let d = dirs.get(path);
    if (d) return d;
    const parent = ensure(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
    d = { name: path.split('/').pop()!, path, dir: true, size: 0, kids: [] };
    parent.kids.push(d);
    dirs.set(path, d);
    return d;
  };
  for (const f of files) {
    if (f[1] === 'd') { ensure(f[0]); continue; }
    const dir = f[0].includes('/') ? f[0].slice(0, f[0].lastIndexOf('/')) : '';
    ensure(dir).kids.push({ name: f[0].split('/').pop()!, path: f[0], dir: false, size: f[2] ?? 0, kids: [] });
  }
  const sort = (n: Node) => { n.kids.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true }))); n.kids.forEach(sort); };
  sort(root);
  return root;
}

/**
 * A GitHub repository, browsed inside the site: its tree, README, files (fetched live from
 * raw.githubusercontent.com and highlighted), commits, and a go-to-file finder.
 */
export class RepoBrowser {
  el: HTMLElement;
  private root: Node;
  private index = new Map<string, Node>();
  private open = new Set<string>();
  private cache = new Map<string, string>();
  private path: string | null = null;
  private live = false;
  private token = 0;
  private $: <T extends HTMLElement = HTMLElement>(s: string) => T;

  constructor(host: HTMLElement, public data: RepoData, private opts: Opts) {
    this.root = buildTree(data.files);
    const walk = (n: Node) => { this.index.set(n.path, n); n.kids.forEach(walk); };
    walk(this.root);
    this.el = document.createElement('div');
    this.el.className = `rb rb--${opts.mode}`;
    this.el.dataset.side = 'closed';
    this.el.innerHTML = this.shell();
    host.replaceChildren(this.el);
    this.$ = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector<T>(s)!;
    this.renderTree();
    this.renderCommits();
    this.bind();
    this.showReadme(false);
    this.checkLive();
  }

  private repoUrl(p = '') { return `https://github.com/${this.data.owner}/${this.data.name}${p}`; }
  private rawUrl(path: string) { return `https://raw.githubusercontent.com/${this.data.owner}/${this.data.name}/${this.data.branch}/${path.split('/').map(encodeURIComponent).join('/')}`; }

  private shell() {
    const d = this.data;
    const langs = d.languages.slice(0, 6);
    const bar = langs.map(([l, p], i) => `<i style="flex:${p};background:${LANG_COLOURS[i % LANG_COLOURS.length]}" title="${esc(l)} ${p}%"></i>`).join('');
    const legend = langs.map(([l, p], i) => `<li><i style="background:${LANG_COLOURS[i % LANG_COLOURS.length]}"></i>${esc(l)} <span>${p}%</span></li>`).join('');
    return `
      <header class="rb__bar">
        <div class="rb__lights">
          ${this.opts.mode === 'modal'
            ? `<button class="rb__light rb__light--close" type="button" data-rb="close" aria-label="Close the code browser">${icon(iClose, 'rb__li')}</button>`
            : `<i class="rb__light"></i>`}
          <i class="rb__light"></i><i class="rb__light"></i>
        </div>
        <button class="rb__iconbtn rb__sidebtn" type="button" data-rb="side" aria-label="Files">${icon(iList)}</button>
        <nav class="rb__crumbs" aria-label="Location in the repository" data-rb-crumbs></nav>
        <div class="rb__actions">
          <button class="rb__find" type="button" data-rb="find"><span class="rb__find-l">${icon(iSearch)}<span>Go to file</span></span><kbd>⌘K</kbd></button>
          ${this.opts.mode === 'inline' ? `<button class="rb__iconbtn" type="button" data-rb="expand" aria-label="Open full screen">${icon(iExpand)}</button>` : ''}
          <a class="rb__iconbtn" href="${this.repoUrl()}" target="_blank" rel="noopener" aria-label="Open on GitHub">${icon(iGithub)}</a>
        </div>
      </header>
      <div class="rb__body">
        <aside class="rb__side" aria-label="Repository">
          <div class="rb__repo">
            <p class="rb__owner">${esc(d.owner)} /</p>
            <p class="rb__name">${esc(d.name)}</p>
            <p class="rb__desc">${esc(d.description)}</p>
            <ul class="rb__facts">
              <li>${icon(iBranch)}${esc(d.branch)}</li>
              <li>${icon(iCommit)}<span data-rb-count>${d.commitCount}</span> commits</li>
              <li>${icon(iStar)}${d.stars}</li>
              <li class="rb__lic">${esc(d.license)}</li>
            </ul>
            <p class="rb__fresh" data-rb-fresh>Updated ${ago(d.pushedAt)}</p>
            <div class="rb__langbar" aria-hidden="true">${bar}</div>
            <ul class="rb__legend">${legend}</ul>
          </div>
          <div class="rb__tabs" role="tablist">
            <button class="rb__tab" role="tab" type="button" aria-selected="true" data-rb-tab="files">Files</button>
            <button class="rb__tab" role="tab" type="button" aria-selected="false" data-rb-tab="commits">Commits</button>
          </div>
          <div class="rb__scroll" data-rb-pane="files"><ul class="rb__tree" role="tree" aria-label="Files" data-rb-tree></ul></div>
          <div class="rb__scroll" data-rb-pane="commits" hidden><ol class="rb__commits" data-rb-commits></ol></div>
        </aside>
        <main class="rb__main">
          <div class="rb__filebar" data-rb-filebar hidden></div>
          <div class="rb__view" data-rb-view tabindex="-1"></div>
        </main>
      </div>
      <div class="rb__finder" data-rb-finder hidden>
        <div class="rb__finder-box" role="dialog" aria-label="Go to file">
          <label class="rb__finder-in">${icon(iSearch)}<input type="text" placeholder="Go to file…" autocomplete="off" spellcheck="false" aria-controls="rb-results-${this.opts.slug}" data-rb-q /></label>
          <ul class="rb__results" id="rb-results-${this.opts.slug}" role="listbox" data-rb-results></ul>
          <p class="rb__finder-foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>esc</kbd> to close</span></p>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- tree
  private item(n: Node, depth: number): string {
    const isOpen = this.open.has(n.path);
    const ic = n.dir ? (isOpen ? iFolderOpen : iFolder) : IMAGE.test(n.name) ? iImage : iFile;
    const kids = n.dir && isOpen ? `<ul role="group">${n.kids.map((k) => this.item(k, depth + 1)).join('')}</ul>` : '';
    return `<li role="none"><button class="rb__node${n.dir ? ' rb__node--dir' : ''}${n.path === this.path ? ' is-current' : ''}" type="button" role="treeitem" ${n.dir ? `aria-expanded="${isOpen}"` : ''} data-path="${esc(n.path)}" style="--d:${depth}">${icon(ic)}<span>${esc(n.name)}</span></button>${kids}</li>`;
  }
  private renderTree() {
    const hadFocus = (document.activeElement as HTMLElement | null)?.closest?.('.rb__tree') ? (document.activeElement as HTMLElement).dataset.path ?? null : undefined;
    this.paintTree();
    if (hadFocus !== undefined) this.el.querySelector<HTMLElement>(hadFocus ? `[data-path="${CSS.escape(hadFocus)}"]` : '[data-readme]')?.focus({ preventScroll: true });
  }
  private paintTree() {
    const readme = this.data.readmePath ? `<li role="none"><button class="rb__node rb__node--readme${this.path === null ? ' is-current' : ''}" type="button" role="treeitem" data-readme style="--d:0">${icon(iBook)}<span>About this repo</span></button></li>` : '';
    this.$('[data-rb-tree]').innerHTML = readme + this.root.kids.map((k) => this.item(k, 0)).join('');
  }
  private reveal(path: string) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) this.open.add(parts.slice(0, i).join('/'));
    this.renderTree();
    requestAnimationFrame(() => {
      const node = this.el.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      node?.scrollIntoView({ block: 'nearest' });
      if (this.el.contains(document.activeElement) || document.activeElement === document.body) node?.focus({ preventScroll: true });
    });
  }

  private renderCommits() {
    this.$('[data-rb-commits]').innerHTML = this.data.commits.map((c) => `
      <li><a class="rb__commit" href="${this.repoUrl(`/commit/${c.sha}`)}" target="_blank" rel="noopener">
        <span class="rb__commit-msg">${esc(c.message)}</span>
        <span class="rb__commit-meta"><code>${c.sha}</code>${ago(c.date)}</span>
      </a></li>`).join('') + `<li><a class="rb__commit rb__commit--all" href="${this.repoUrl('/commits')}" target="_blank" rel="noopener">All ${this.data.commitCount} commits on GitHub ${icon(iOut)}</a></li>`;
  }

  // ---------------------------------------------------------------- views
  private crumbs(path: string | null) {
    const d = this.data;
    const parts = path ? path.split('/') : [];
    const html = [`<button type="button" data-crumb="">${esc(d.name)}</button>`]
      .concat(parts.map((p, i) => {
        const full = parts.slice(0, i + 1).join('/');
        return i === parts.length - 1 ? `<b aria-current="page">${esc(p)}</b>` : `<button type="button" data-crumb="${esc(full)}">${esc(p)}</button>`;
      }));
    this.$('[data-rb-crumbs]').innerHTML = `<span class="rb__crumb-owner">${esc(d.owner)}</span>` + html.map((h) => `<span class="rb__sep">/</span>${h}`).join('');
  }

  private setCurrent() {
    this.el.querySelectorAll('.rb__node.is-current').forEach((b) => b.classList.remove('is-current'));
    const sel = this.path === null ? '[data-readme]' : `[data-path="${CSS.escape(this.path)}"]`;
    this.el.querySelector(sel)?.classList.add('is-current');
  }

  showReadme(route = true) {
    this.token++;
    this.path = null;
    this.crumbs(null);
    this.$('[data-rb-filebar]').hidden = true;
    const view = this.$('[data-rb-view]');
    view.className = 'rb__view';
    view.innerHTML = this.data.readme ? `<article class="rb__prose">${this.data.readme}</article>` : this.folder('');
    view.scrollTop = 0;
    this.setCurrent();
    if (route) this.opts.onRoute?.(null);
  }

  private folder(path: string) {
    const n = this.index.get(path) ?? this.root;
    return `<div class="rb__listing"><p class="rb__listing-h">${icon(iFolderOpen)}${esc(path || this.data.name)}</p><ul>${n.kids.map((k) => `
      <li><button type="button" data-open="${esc(k.path)}" data-dir="${k.dir}">${icon(k.dir ? iFolder : IMAGE.test(k.name) ? iImage : iFile)}<span>${esc(k.name)}</span><span class="rb__size">${k.dir ? `${k.kids.length} items` : kb(k.size)}</span></button></li>`).join('')}</ul></div>`;
  }

  showFolder(path: string) {
    this.token++;
    this.path = path;
    this.crumbs(path);
    this.$('[data-rb-filebar]').hidden = true;
    const view = this.$('[data-rb-view]');
    view.className = 'rb__view';
    view.innerHTML = this.folder(path);
    view.scrollTop = 0;
    this.open.add(path);
    this.reveal(path);
    this.opts.onRoute?.(path);
  }

  /** Open a file (optionally at a line). Text is fetched live from GitHub and highlighted. */
  async openFile(path: string, line?: number) {
    const n = this.index.get(path);
    if (!n) { this.showReadme(); return; }
    if (n.dir) { this.showFolder(path); return; }
    const t = ++this.token;
    this.path = path;
    this.crumbs(path);
    this.reveal(path);
    this.el.dataset.side = 'closed';
    this.opts.onRoute?.(path);
    const bar = this.$('[data-rb-filebar]');
    const view = this.$('[data-rb-view]');
    const raw = this.rawUrl(path);
    const lang = langOf(path);
    bar.hidden = false;
    bar.innerHTML = `<span class="rb__fileinfo"><b>${esc(n.name)}</b><span>${kb(n.size)}</span><span data-rb-lines></span>${lang ? `<span>${esc(lang)}</span>` : ''}</span>
      <span class="rb__fileacts">
        ${!BINARY.test(path) && !IMAGE.test(path) ? `<button type="button" class="rb__chip" data-rb="copy">${icon(iCopy)}<span>Copy</span></button>` : ''}
        <a class="rb__chip" href="${this.repoUrl(`/blob/${this.data.branch}/${path}`)}" target="_blank" rel="noopener">GitHub ${icon(iOut)}</a>
      </span>`;
    view.className = 'rb__view';
    view.scrollTop = 0;

    if (IMAGE.test(path)) {
      view.innerHTML = `<figure class="rb__img"><img src="${raw}" alt="${esc(n.name)}" decoding="async" /></figure>`;
      return;
    }
    if (BINARY.test(path) || n.size > MAX_TEXT) {
      view.innerHTML = `<div class="rb__msg"><p>${BINARY.test(path) ? 'This is a binary file' : 'This file is too large to show here'} (${kb(n.size)}).</p><a href="${this.repoUrl(`/blob/${this.data.branch}/${path}`)}" target="_blank" rel="noopener">Open it on GitHub ${icon(iOut)}</a></div>`;
      return;
    }
    view.innerHTML = `<div class="rb__loading" aria-label="Loading">${'<i></i>'.repeat(14)}</div>`;
    let text = this.cache.get(path);
    if (text === undefined) {
      try {
        const res = await fetch(raw);
        if (!res.ok) throw new Error(String(res.status));
        text = await res.text();
        this.cache.set(path, text);
      } catch {
        if (t !== this.token) return;
        view.innerHTML = `<div class="rb__msg"><p>GitHub didn’t send this file just now.</p><a href="${this.repoUrl(`/blob/${this.data.branch}/${path}`)}" target="_blank" rel="noopener">Open it on GitHub ${icon(iOut)}</a></div>`;
        return;
      }
    }
    if (t !== this.token) return;
    const lines = text.replace(/\n$/, '').split('\n').length;
    this.el.querySelector('[data-rb-lines]')!.textContent = `${lines} lines`;
    if (lang === 'markdown') { await this.markdown(text, path, t); return; }
    const html = await highlight(text.replace(/\n$/, ''), lang);
    if (t !== this.token) return;
    view.className = 'rb__view rb__view--code';
    view.innerHTML = `<div class="rb__code">${html}</div>`;
    if (line) this.goLine(line);
  }

  private goLine(line: number) {
    const el = this.el.querySelectorAll('.rb__code .line')[line - 1] as HTMLElement | undefined;
    if (!el) return;
    el.classList.add('is-hit');
    el.scrollIntoView({ block: 'center' });
  }

  private async markdown(text: string, path: string, t: number) {
    const { marked } = await import('marked');
    if (t !== this.token) return;
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const resolve = (u: string) => {
      const parts = (dir + u.replace(/^\.\//, '')).split('/');
      const out: string[] = [];
      for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
      return out.join('/');
    };
    const rel = (u: string) => u && !/^(https?:|mailto:|#|data:)/.test(u);
    let html = await marked.parse(text.split('\n').filter((l) => !/img\.shields\.io/.test(l)).join('\n'));
    html = html
      .replace(/(<img[^>]*?\bsrc=")([^"]+)"/g, (m, a, u) => `${a}${rel(u) ? this.rawUrl(resolve(u)) : u}" loading="lazy"`)
      .replace(/<a href="([^"]+)"/g, (m, u) => (u.startsWith('#') ? m : rel(u) ? `<a href="${this.repoUrl(`/blob/${this.data.branch}/${resolve(u)}`)}" data-repo-path="${esc(resolve(u).replace(/#.*$/, ''))}"` : `<a href="${u}" target="_blank" rel="noopener"`))
      .replace(/<!--[\s\S]*?-->/g, '');
    const view = this.$('[data-rb-view]');
    view.className = 'rb__view';
    view.innerHTML = `<article class="rb__prose">${html}</article>`;
  }

  // ---------------------------------------------------------------- finder
  private finder(open: boolean) {
    const f = this.$('[data-rb-finder]');
    f.hidden = !open;
    if (open) {
      const q = this.$<HTMLInputElement>('[data-rb-q]');
      q.value = '';
      this.results('');
      q.focus();
    }
  }
  private sel = 0;
  private hits: string[] = [];
  private results(q: string) {
    const files = this.data.files.filter((f) => f[1] === 'f').map((f) => f[0]);
    const query = q.trim().toLowerCase().replace(/\s+/g, '');
    this.hits = query
      ? (() => {
        const scored = files.map((p) => [p, fuzzy(query, p)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
        const best = scored[0]?.[1] ?? 0;
        return scored.filter(([, s]) => s >= best * 0.4).slice(0, 12).map(([p]) => p);
      })()
      : files.filter((p) => !p.startsWith('.') && p.split('/').length <= 3).slice(0, 12);
    this.sel = 0;
    this.paintResults();
  }
  private paintResults() {
    const ul = this.$('[data-rb-results]');
    ul.innerHTML = this.hits.length
      ? this.hits.map((p, i) => {
        const cut = p.lastIndexOf('/');
        return `<li role="option" aria-selected="${i === this.sel}" data-hit="${esc(p)}">${icon(IMAGE.test(p) ? iImage : iFile)}<b>${esc(p.slice(cut + 1))}</b><span>${esc(cut > 0 ? p.slice(0, cut) : '')}</span></li>`;
      }).join('')
      : '<li class="rb__none">No files match</li>';
    ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------- events
  private bind() {
    const el = this.el;
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-rb]')?.dataset.rb;
      if (act === 'close') return this.opts.onClose?.();
      if (act === 'expand') return this.opts.onExpand?.(this.path);
      if (act === 'find') return this.finder(true);
      if (act === 'side') { el.dataset.side = el.dataset.side === 'open' ? 'closed' : 'open'; return; }
      if (act === 'copy' && this.path) {
        const btn = t.closest<HTMLElement>('[data-rb="copy"]')!;
        navigator.clipboard?.writeText(this.cache.get(this.path) ?? '').then(() => {
          btn.querySelector('span')!.textContent = 'Copied';
          setTimeout(() => { const s = btn.querySelector('span'); if (s) s.textContent = 'Copy'; }, 1800);
        });
        return;
      }
      const tab = t.closest<HTMLElement>('[data-rb-tab]');
      if (tab) {
        el.querySelectorAll('[data-rb-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        el.querySelectorAll<HTMLElement>('[data-rb-pane]').forEach((p) => (p.hidden = p.dataset.rbPane !== tab.dataset.rbTab));
        return;
      }
      if (t.closest('[data-readme]')) { this.showReadme(); el.dataset.side = 'closed'; return; }
      const node = t.closest<HTMLElement>('.rb__node[data-path]');
      if (node) {
        const p = node.dataset.path!;
        const n = this.index.get(p)!;
        if (n.dir) {
          if (this.open.has(p)) this.open.delete(p); else this.open.add(p);
          this.renderTree();
          this.el.querySelector<HTMLElement>(`[data-path="${CSS.escape(p)}"]`)?.focus();
        } else this.openFile(p);
        return;
      }
      const crumb = t.closest<HTMLElement>('[data-crumb]');
      if (crumb) { const p = crumb.dataset.crumb!; if (p) this.showFolder(p); else this.showReadme(); return; }
      const listed = t.closest<HTMLElement>('[data-open]');
      if (listed) { this.openFile(listed.dataset.open!); return; }
      const hit = t.closest<HTMLElement>('[data-hit]');
      if (hit) { this.finder(false); this.openFile(hit.dataset.hit!); return; }
      if (t.closest('[data-rb-finder]') && !t.closest('.rb__finder-box')) { this.finder(false); return; }
      // links inside the README that point at files in the repo open here
      const a = t.closest<HTMLAnchorElement>('a[data-repo-path]');
      if (a && this.index.has(a.dataset.repoPath!)) { e.preventDefault(); this.openFile(a.dataset.repoPath!); return; }
      const anchor = t.closest<HTMLAnchorElement>('a[data-readme-anchor]');
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
        this.el.querySelector(anchor.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    const q = this.$<HTMLInputElement>('[data-rb-q]');
    q.addEventListener('input', () => this.results(q.value));
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.sel = Math.max(0, Math.min(this.hits.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1)));
        this.paintResults();
      } else if (e.key === 'Enter' && this.hits[this.sel]) {
        e.preventDefault();
        this.finder(false);
        this.openFile(this.hits[this.sel]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.finder(false);
        this.$('[data-rb="find"]').focus();
      }
    });
    // keys work whenever this browser is the thing you are using: its window is open, or focus
    // or the pointer is inside it
    document.addEventListener('keydown', (e) => {
      if (!el.isConnected) return;
      const dialog = el.closest('dialog');
      const active = dialog ? dialog.open : el.contains(document.activeElement) || el.matches(':hover');
      if (!active) return;
      const typing = (e.target as HTMLElement).matches('input, textarea, [contenteditable]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (!typing && (e.key === 't' || e.key === '/'))) {
        e.preventDefault();
        this.finder(true);
      }
      // arrow keys walk the tree
      const node = (e.target as HTMLElement).closest<HTMLElement>('.rb__node');
      if (node && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const all = [...this.el.querySelectorAll<HTMLElement>('.rb__node')];
        all[Math.max(0, Math.min(all.length - 1, all.indexOf(node) + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }
      if (node?.dataset.path && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const p = node.dataset.path;
        if (this.index.get(p)?.dir) {
          e.preventDefault();
          if (e.key === 'ArrowRight') this.open.add(p); else this.open.delete(p);
          this.renderTree();
          this.el.querySelector<HTMLElement>(`[data-path="${CSS.escape(p)}"]`)?.focus();
        }
      }
    });
  }

  /** Once per page view, ask GitHub if anything has moved since the snapshot, and catch up if so. */
  private async checkLive() {
    if (this.live) return;
    this.live = true;
    const fresh = this.$('[data-rb-fresh]');
    const d = this.data;
    try {
      const api = `https://api.github.com/repos/${d.owner}/${d.name}`;
      const res = await fetch(`${api}/commits?per_page=15&sha=${d.branch}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(String(res.status));
      const commits = (await res.json()) as { sha: string; commit: { message: string; author?: { date: string }; committer?: { date: string } } }[];
      const latest = commits[0];
      const moved = latest && latest.sha.slice(0, 7) !== d.commits[0]?.sha;
      if (moved) {
        d.commits = commits.map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], date: c.commit.author?.date ?? c.commit.committer?.date ?? '' }));
        d.pushedAt = d.commits[0].date;
        this.renderCommits();
        // the tree too, so new files can be opened
        const tr = await fetch(`${api}/git/trees/${d.branch}?recursive=1`);
        if (tr.ok) {
          const tree = (await tr.json()) as { tree: { path: string; type: string; size?: number }[] };
          d.files = tree.tree.filter((e) => !/(^|\/)\.DS_Store$/.test(e.path)).map((e) => (e.type === 'tree' ? [e.path, 'd'] : [e.path, 'f', e.size ?? 0])) as RepoData['files'];
          this.root = buildTree(d.files);
          this.index.clear();
          const walk = (n: Node) => { this.index.set(n.path, n); n.kids.forEach(walk); };
          walk(this.root);
          this.renderTree();
        }
      }
      fresh.innerHTML = `<i class="rb__dot"></i>Live from GitHub · last commit ${ago(d.commits[0].date)}`;
      fresh.dataset.live = 'true';
    } catch {
      fresh.textContent = `Snapshot of ${new Date(d.snapshotAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · updated ${ago(d.pushedAt)}`;
    }
  }
}
