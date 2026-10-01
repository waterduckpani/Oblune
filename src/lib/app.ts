import type Lenis from 'lenis';
import type { Scope } from './scope';
import type { Chrome } from './chrome';
import type { Router } from './router';
import type { initRepos } from './repo/open';

/** What a page is given when it mounts, and what it hands back. */
export type PageCtx = {
  scope: Scope;
  /** The view element holding this page's content. */
  view: HTMLElement;
  /** true on a hard load (the first page of a visit), false when arriving from another page. */
  first: boolean;
};
export type PageHandle = {
  destroy?(): void;
  /** Where an in-page link lands: the element, and an offset from its top in px. */
  target?(hash: string): { el: Element; offset?: number; label?: string } | null;
  /** Played as the curtain lifts. */
  intro?(): void;
};
export type PageModule = { mount(ctx: PageCtx): PageHandle | Promise<PageHandle> };

/** The things that live for the whole visit, shared by every page. */
export const app = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  coarse: matchMedia('(pointer: coarse)').matches,
  lenis: null as Lenis | null,
  chrome: null as unknown as Chrome,
  router: null as unknown as Router,
  repos: null as unknown as ReturnType<typeof initRepos>,
  /** A window (code, a live site, a zoomed screen) is covering the page, so the page may rest. */
  paused: false,
};
