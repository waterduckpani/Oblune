import { gsap } from 'gsap';

/**
 * Everything a page sets up, so it can all be taken down when you leave it: listeners, ticker
 * callbacks, observers and GSAP work. Pages are swapped in place (the sound and the nav carry on),
 * so nothing a page starts may outlive it.
 */
export class Scope {
  private ac = new AbortController();
  private undo: (() => void)[] = [];
  readonly ctx = gsap.context(() => {});
  get signal() { return this.ac.signal; }
  get dead() { return this.ac.signal.aborted; }

  on<K extends keyof WindowEventMap>(t: Window, type: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions): void;
  on<K extends keyof DocumentEventMap>(t: Document, type: K, fn: (e: DocumentEventMap[K]) => void, o?: AddEventListenerOptions): void;
  on<K extends keyof HTMLElementEventMap>(t: Element, type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions): void;
  on(t: EventTarget, type: string, fn: (e: Event) => void, o?: AddEventListenerOptions): void;
  on(t: EventTarget, type: string, fn: (e: never) => void, o: AddEventListenerOptions = {}) {
    t.addEventListener(type, fn as EventListener, { ...o, signal: this.signal });
  }

  /** A callback on GSAP's ticker, for as long as the page lives. */
  tick(fn: (time: number, delta: number) => void) {
    gsap.ticker.add(fn);
    this.undo.push(() => gsap.ticker.remove(fn));
  }

  /** GSAP work (tweens, ScrollTriggers, SplitText) that should be reverted with the page. */
  gsap<T>(fn: () => T): T {
    let out!: T;
    this.ctx.add(() => { out = fn(); });
    return out;
  }

  observe<O extends { disconnect(): void }>(o: O) { this.undo.push(() => o.disconnect()); return o; }
  add(fn: () => void) { this.undo.push(fn); }

  kill() {
    if (this.dead) return;
    this.ac.abort();
    for (const f of this.undo.reverse()) { try { f(); } catch { /* already gone */ } }
    this.undo = [];
    this.ctx.revert();
  }
}
