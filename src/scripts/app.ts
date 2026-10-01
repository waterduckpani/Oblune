import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { app } from '../lib/app';
import { initChrome } from '../lib/chrome';
import { createRouter } from '../lib/router';
import { initRepos } from '../lib/repo/open';
import { initLive } from '../lib/live';
import { wave, fillFrom, copyEmail, magnetic } from '../lib/fx';
import { initCursor } from '../lib/cursor';
import { enter, needsEnter } from '../lib/enter';

/**
 * Starts once per visit. Everything here outlives the pages: smooth scroll, the nav, the sound,
 * the windows for code and live sites, and the router that swaps pages beneath them.
 */
gsap.registerPlugin(ScrollTrigger, SplitText);

if (!app.reduced) {
  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  app.lenis = lenis;
}

const shell = document.querySelector<HTMLElement>('[data-nav]')!;
wave(shell); fillFrom(shell); copyEmail(shell);
if (!app.coarse && !app.reduced) magnetic(shell);
if (!app.coarse) initCursor(app.reduced);

app.chrome = initChrome({ lenis: app.lenis, reduced: app.reduced });
app.chrome.armSound();

// a window over the page (code, a live site) lets the page rest underneath
const cover = { onOpen: () => { app.paused = true; app.lenis?.stop(); }, onClose: () => { app.paused = false; app.lenis?.start(); } };
app.repos = initRepos(cover);
initLive(cover);

needsEnter();
app.router = createRouter();
app.router.start().then(() => {
  // the home page's loader asks at its own end; any other first page asks over a veil
  if (document.querySelector('[data-loader]')) return;
  app.lenis?.stop();
  enter('veil').then(() => app.lenis?.start());
});

Object.assign(window as unknown as Record<string, unknown>, { __oblune: app });
