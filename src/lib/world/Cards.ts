import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uBend;
uniform float uSkew;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  // a sheet of paper pulled through the scroll: the middle lags, the edges lead. The plane is a unit
  // square scaled to the card, so a bend in px is divided by the card's size here.
  p.y += sin(uv.x * 3.14159265) * uBend / max(uSize.y, 1.0);
  p.x += (uv.y - 0.5) * uSkew / max(uSize.x, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

// The cover, cover-fitted with rounded corners; it arrives behind a curved edge, like the terminator.
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uHasTex;
uniform vec2 uSize;     // px
uniform vec2 uImg;      // image px
uniform float uRadius;  // px
uniform float uHover;
uniform float uReveal;
uniform vec3 uBg;
uniform vec2 uDrift;
varying vec2 vUv;
void main() {
  vec2 px = vUv * uSize;
  vec2 q = abs(px - uSize * 0.5) - (uSize * 0.5 - uRadius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float aa = 1.0 - smoothstep(-0.75, 0.75, d);
  // the reveal: an elliptical edge sweeping up from the bottom
  vec2 e = (vUv - vec2(0.5, -0.25)) / vec2(1.5, 1.0);
  float edge = length(e) - uReveal * 1.6;
  float shown = 1.0 - smoothstep(-0.01, 0.01, edge);
  if (aa * shown <= 0.0) discard;
  // cover fit, with a little zoom on hover and a drift with the pointer
  float sa = uSize.x / uSize.y, ia = uImg.x / uImg.y;
  vec2 sc = sa > ia ? vec2(1.0, ia / sa) : vec2(sa / ia, 1.0);
  float z = 1.06 - uHover * 0.05;
  vec2 uv = (vUv - 0.5) * sc / z + 0.5 + uDrift * 0.012;
  vec3 col = uHasTex > 0.5 ? texture2D(uTex, uv).rgb : uBg;
  // a hairline of light round the edge, so a dark cover still has an edge at night
  col += smoothstep(-1.6, -0.4, d) * 0.08;
  gl_FragColor = vec4(col, aa * shown);
}`;

type Card = {
  el: HTMLElement;
  mesh: THREE.Mesh;
  u: Record<string, THREE.IUniform>;
  src: string;
  rect: { x: number; y: number; w: number; h: number };
  tex: THREE.Texture | null;
  loading: boolean;
  hover: number;
  hoverTo: number;
  reveal: number;
  revealing: boolean;
  bend: number;
};

/**
 * The work, drawn on the stage: each card's cover is a plane laid exactly on its DOM slot. Living in
 * the stage, the covers share depth with the ribbon (it can pass behind or in front of them), bend
 * with the speed of the scroll, zoom a touch on hover, and arrive behind a curved edge.
 * The DOM keeps the links, text and focus; its own <img> is the fallback until a texture is ready.
 */
export class Cards {
  group = new THREE.Group();
  private list: Card[] = [];
  private queue: Card[] = [];
  private loader = new THREE.ImageBitmapLoader();
  private drift = new THREE.Vector2();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });
  }

  /** Lay planes on these slots. Each needs data-src (the cover) and data-bg (its colour). */
  bind(els: HTMLElement[]) {
    this.release();
    this.list = els.map((el) => {
      const u = {
        uTex: { value: null }, uHasTex: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uImg: { value: new THREE.Vector2(16, 10) },
        uRadius: { value: 18 }, uHover: { value: 0 }, uReveal: { value: 0 }, uBg: { value: new THREE.Color(el.dataset.bg || '#dddddd') },
        uBend: { value: 0 }, uSkew: { value: 0 }, uDrift: { value: this.drift },
      };
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthWrite: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 12), mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      // phones draw the covers small: the 800 px picture is plenty there
      const small = el.dataset.srcSmall && el.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 2) <= 900;
      const c: Card = { el, mesh, u, src: small ? el.dataset.srcSmall! : el.dataset.src!, rect: { x: 0, y: 0, w: 1, h: 1 }, tex: null, loading: false, hover: 0, hoverTo: 0, reveal: 0, revealing: false, bend: 0 };
      return c;
    });
    this.layout();
  }

  /** Measure the slots again (after a resize or a font load). */
  layout() {
    const sy = scrollY;
    for (const c of this.list) {
      const r = c.el.getBoundingClientRect();
      c.rect = { x: r.left, y: r.top + sy, w: r.width, h: r.height };
      c.mesh.position.set(r.left + r.width / 2, -(r.top + sy + r.height / 2), 0);
      c.mesh.scale.set(r.width, r.height, 1);
      (c.u.uSize.value as THREE.Vector2).set(r.width, r.height);
      c.u.uRadius.value = Math.min(22, r.width * 0.025);
    }
  }

  hover(i: number, on: boolean) { const c = this.list[i]; if (c) c.hoverTo = on ? 1 : 0; }
  pointer(x: number, y: number) { this.drift.set(x, y); }

  release() {
    for (const c of this.list) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      (c.mesh.material as THREE.Material).dispose();
      c.tex?.dispose();
      c.el.classList.remove('is-gl');
    }
    this.list = [];
    this.queue = [];
  }

  /** Advance the cards; true if anything moved. */
  update(t: number, dt: number, velocity: number, scrollY: number, vh: number) {
    if (!this.list.length) return false;
    let moved = false;
    // one texture to the GPU per frame at most, so a scroll never stalls on uploads
    const next = this.queue.shift();
    if (next?.tex) {
      this.renderer.initTexture(next.tex);
      next.u.uTex.value = next.tex;
      next.u.uHasTex.value = 1;
      next.el.classList.add('is-gl');
      moved = true;
    }
    // a gentle bend: a sheet of paper, not a flag (at most ~18px, and only at real speed)
    const bendTo = Math.max(-1, Math.min(1, velocity / 4500));
    for (const c of this.list) {
      const top = c.rect.y - scrollY, bottom = top + c.rect.h;
      const near = bottom > -vh * 0.5 && top < vh * 1.8;
      c.mesh.visible = bottom > -40 && top < vh + 40;
      if (near && !c.tex && !c.loading) {
        c.loading = true;
        this.loader.load(c.src, (bmp) => {
          const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
          tex.colorSpace = THREE.NoColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.anisotropy = 4;
          tex.needsUpdate = true;
          c.tex = tex;
          (c.u.uImg.value as THREE.Vector2).set(bmp.width, bmp.height);
          this.queue.push(c);
        }, undefined, () => { c.loading = false; });
      }
      if (!c.mesh.visible) continue;
      // arrive when a fifth of it is on screen
      if (!c.revealing && top < vh * 0.92) c.revealing = true;
      if (c.revealing && c.reveal < 1) { c.reveal = Math.min(1, c.reveal + dt / 1.1); c.u.uReveal.value = 1 - Math.pow(1 - c.reveal, 3); moved = true; }
      c.hover += (c.hoverTo - c.hover) * (1 - Math.exp(-8 * dt));
      if (Math.abs(c.hover - c.hoverTo) > 0.001) moved = true;
      c.u.uHover.value = c.hover;
      const b = bendTo * Math.min(18, c.rect.h * 0.035);
      c.bend += (b - c.bend) * (1 - Math.exp(-7 * dt));
      if (Math.abs(c.bend) > 0.05 || Math.abs(b - c.bend) > 0.05) moved = true;
      c.u.uBend.value = -c.bend;
      c.u.uSkew.value = 0;
    }
    return moved;
  }
}
