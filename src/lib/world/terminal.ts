import * as THREE from 'three';

/**
 * Alfard's approval-gate session (from its README recording), typeset crisply and typed out
 * as you scroll. The hostname and email address are neutralised; everything else is verbatim.
 */
type Line = { text: string; color: string; weight?: number; gap?: number; key?: 'approve' | 'y' };
const K = 1.18;
const W = 2400, H = 1573;

const SESSION: Line[] = [
  { text: '~ % alfard run test', color: '#e8e9ec', weight: 600 },
  { text: 'test  ·  Manage my emails, read, reply and sort through them.', color: '#8b8c92', gap: 14 },
  { text: '[mcp] connected to 0/0 server(s)', color: '#d8d9dc', weight: 600, gap: 14 },
  { text: 'connecting integrations...', color: '#7fb58a' },
  { text: 'connected: gdrive, gmail, web search', color: '#b9bac0' },
  { text: 'you: check my email for an email from slickdash and reply to it', color: '#f2f2f4', weight: 600, gap: 14 },
];
const REVIEW: [string, string][] = [
  ['Tool:', 'gmail_send_message'],
  ['Arguments:', '{ "to": "slickdash@example.com",'],
  ['', '  "subject": "Re: Hey what\'s up!",'],
  ['', '  "body": "Hi, I\'m doing well, thank you!" }'],
  ['Source:', 'tool_result'],
];
const AFTER: Line[] = [
  { text: 'I found an email from slickdash with the subject "Hey what\'s up!"', color: '#b9bac0', gap: 12 },
  { text: 'and sent a reply. Logged to audit.jsonl.', color: '#b9bac0' },
];

const total = (() => {
  let n = 0;
  SESSION.forEach((l) => (n += l.text.length));
  REVIEW.forEach(([k, v]) => (n += k.length + v.length));
  n += 'Approve? [y/n]: '.length + 1;
  AFTER.forEach((l) => (n += l.text.length));
  return n;
})();

const SESSION_CHARS = SESSION.reduce((n, l) => n + l.text.length, 0);
const GATE_CHARS = SESSION_CHARS + REVIEW.reduce((n, [k, v]) => n + k.length + v.length, 0) + 'Approve? [y/n]: '.length;

export class Terminal {
  /** How much of the session has been typed, 0..1. The stage eases this toward the step's mark. */
  typed = 0;
  /** Where each step stops: after the request, and at the approval prompt (before the "y"). */
  marks = { request: SESSION_CHARS / total, gate: GATE_CHARS / total };
  canvas = document.createElement('canvas');
  texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private shown = -1;
  private ready = false;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    Promise.all([
      document.fonts.load('400 32px "JetBrains Mono Variable"'),
      document.fonts.load('700 32px "JetBrains Mono Variable"'),
    ]).then(() => { this.ready = true; this.draw(this.shown < 0 ? 0 : this.shown, true); });
  }

  /** progress 0..1 across the whole session; returns which beat we are on (0, 1, 2). */
  update(progress: number, time: number) {
    const chars = Math.round(Math.max(0, Math.min(1, progress)) * total);
    const blink = Math.floor(time * 2) % 2;
    const key = chars * 2 + blink;
    if (key !== this.shown && this.ready) { this.draw(chars, false, blink === 1); this.shown = key; }
    const approveAt = SESSION.reduce((n, l) => n + l.text.length, 0) + REVIEW.reduce((n, [k, v]) => n + k.length + v.length, 0);
    return chars < SESSION.reduce((n, l) => n + l.text.length, 0) ? 0 : chars <= approveAt + 16 ? 1 : 2;
  }

  private draw(chars: number, force: boolean, cursorOn = true) {
    const x = this.ctx;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#161618'; x.fillRect(0, 0, W, H);
    // set larger than life, so it reads on a plate a few hundred px wide
    x.setTransform(K, 0, 0, K, 0, 0);
    x.fillStyle = '#1e1e21'; x.fillRect(0, 0, W / K, 96);
    for (let i = 0; i < 3; i++) { x.fillStyle = '#39393d'; x.beginPath(); x.arc(56 + i * 46, 48, 13, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#7d7e84'; x.font = '500 28px "JetBrains Mono Variable"'; x.textAlign = 'center'; x.fillText('alfard', W / K / 2, 58); x.textAlign = 'left';
    const L = 70; let y = 190; const lh = 56;
    let left = chars;
    let cx = L, cy = y;
    const type = (text: string, color: string, weight = 400, size = 36) => {
      const s = text.slice(0, Math.max(0, left));
      left -= text.length;
      x.font = `${weight} ${size}px "JetBrains Mono Variable"`; x.fillStyle = color; x.fillText(s, L, y);
      cx = L + x.measureText(s).width; cy = y;
      return s.length === text.length;
    };
    for (const l of SESSION) {
      y += l.gap ?? 0;
      if (left <= 0) break;
      type(l.text, l.color, l.weight);
      y += lh;
    }
    // the review box appears once the request has been typed
    if (left > 0) {
      y += 28;
      const by = y - 44, bh = 356;
      const awaiting = left > 0 && left <= REVIEW.reduce((n, [k, v]) => n + k.length + v.length, 0) + 16;
      x.strokeStyle = awaiting ? '#e8c37a' : '#4a4b50'; x.lineWidth = awaiting ? 4 : 3;
      x.strokeRect(L - 12, by, W / K - 2 * L + 24, bh);
      x.fillStyle = '#161618'; x.fillRect(W / K / 2 - 170, by - 24, 340, 48);
      x.font = '600 32px "JetBrains Mono Variable"'; x.fillStyle = '#e8c37a'; x.textAlign = 'center'; x.fillText('Review required', W / K / 2, by + 11); x.textAlign = 'left';
      y += 34;
      for (const [k, v] of REVIEW) {
        if (left <= 0) break;
        const ks = k.slice(0, left); left -= k.length;
        x.font = '400 34px "JetBrains Mono Variable"'; x.fillStyle = '#8b8c92'; x.fillText(ks, L + 20, y);
        if (left > 0) { const vs = v.slice(0, left); left -= v.length; x.fillStyle = '#e6e7ea'; x.fillText(vs, L + 300, y); cx = L + 300 + x.measureText(vs).width; cy = y; }
        y += 54;
      }
      y = by + bh + 70;
    }
    if (left > 0) {
      const q = 'Approve? [y/n]: ';
      x.font = '700 38px "JetBrains Mono Variable"'; x.fillStyle = '#f2f2f4';
      const qs = q.slice(0, left); x.fillText(qs, L, y); left -= q.length;
      cx = L + x.measureText(qs).width; cy = y;
      if (left > 0) { x.fillStyle = '#e8c37a'; x.fillText('y', cx, y); cx += x.measureText('y').width; left -= 1; }
      y += lh + 14;
    }
    for (const l of AFTER) {
      y += l.gap ?? 0;
      if (left <= 0) break;
      type(l.text, l.color, l.weight);
      y += lh;
    }
    if (left > 0 || chars >= total) {
      y += 18;
      x.font = '600 36px "JetBrains Mono Variable"'; x.fillStyle = '#f2f2f4'; x.fillText('you: ', L, y);
      cx = L + x.measureText('you: ').width; cy = y;
    }
    if (cursorOn) { x.fillStyle = '#e6e7ea'; x.fillRect(cx + 6, cy - 32, 20, 40); }
    this.texture.needsUpdate = true;
    void force;
  }
}
