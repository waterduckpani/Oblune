import * as THREE from 'three';

export type Pt = { x: number; y: number };

const VERT = /* glsl */ `
uniform vec2 uViewport;
uniform float uScroll;
uniform float uWidth;
uniform float uDpr;
uniform float uTime;
uniform vec4 uPlucks[6];   // arc length, start time, amplitude px, direction
uniform vec2 uPull;        // how far the bead has been pulled from the head; the tip follows it
uniform float uHeadLen;
attribute vec2 aPos;
attribute vec2 aNormal;
attribute float aSide;
attribute float aLen;
varying float vSide;
varying float vLen;
varying float vY;
varying vec2 vScreen;
void main() {
  float w = uWidth * 0.5 + 3.0 / uDpr;
  // a plucked string: a standing ring where it was struck, and two pulses running away from it
  float disp = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 k = uPlucks[i];
    float age = uTime - k.y;
    if (k.z <= 0.0 || age < 0.0 || age > 3.0) continue;
    float x = aLen - k.x;
    float env = k.z * exp(-age * 2.4);
    float ring = exp(-abs(x) / 150.0) * sin(age * 34.0) * cos(x * 0.018);
    float run = exp(-pow((abs(x) - age * 620.0) / 70.0, 2.0)) * 0.7 * exp(-age * 1.2);
    disp += env * (ring + run) * k.w;
  }
  vec2 p = aPos - vec2(0.0, uScroll) + aNormal * (aSide * w + disp);
  // the drawn line near the head bends toward the bead, like a thread tied to it
  float behind = uHeadLen - aLen;
  if (behind >= 0.0) p += uPull * exp(-behind / 160.0);
  vScreen = p;
  vSide = aSide * w;
  vLen = aLen;
  vY = aPos.y;
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uHead;
uniform float uWidth;
uniform float uGhostWidth;
uniform float uDpr;
uniform float uAlpha;
uniform float uGhostAlpha;
uniform float uDash;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec2 uNightY;
uniform float uFade;       // the drawn line fades in over this many px behind its tail
uniform float uTail;
uniform vec4 uClip;        // a screen rect the line passes behind (a pinned stage on phones)
varying float vSide;
varying float vLen;
varying float vY;
varying vec2 vScreen;
void main() {
  if (uClip.z > 0.0 && vScreen.x > uClip.x && vScreen.x < uClip.x + uClip.z && vScreen.y > uClip.y && vScreen.y < uClip.y + uClip.w) discard;
  float drawn = step(vLen, uHead);
  // freshly drawn line is wetter: it swells near the head and settles behind it
  float fresh = exp(-max(uHead - vLen, 0.0) / 90.0) * drawn;
  float hw = uWidth * 0.5 * (1.0 + fresh * 0.9);
  float hwPx = max(hw * uDpr, 0.5);
  float fade = min(1.0, hw * uDpr / 0.5);
  float cov = clamp(hwPx - abs(vSide) * uDpr + 0.5, 0.0, 1.0) * fade;
  float a = drawn * uAlpha;
  if (drawn < 0.5) {
    // the path ahead, as a row of fine dots
    if (uDash > 0.0) {
      float u = (fract(vLen / uDash) - 0.5) * uDash;
      float dd = length(vec2(u, vSide));
      cov = clamp((uGhostWidth * 0.5 - dd) * uDpr + 0.5, 0.0, 1.0);
    }
    a = uGhostAlpha * exp(-max(vLen - uHead, 0.0) / 2400.0);
  }
  a *= smoothstep(uTail, uTail + uFade, vLen);
  vec3 col = mix(uColorA, uColorB, smoothstep(uNightY.x, uNightY.y, vY));
  gl_FragColor = vec4(col, a * cov);
}`;

/** A polyline drawn as an anti-aliased ribbon, up to a head measured in px of arc length. */
export class Line {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  geometry = new THREE.BufferGeometry();
  total = 0;
  private cap = 0;

  constructor(opts: { width?: number; ghostWidth?: number; ghostAlpha?: number; dash?: number; alpha?: number } = {}) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uViewport: { value: new THREE.Vector2(1, 1) },
        uScroll: { value: 0 },
        uDpr: { value: 1 },
        uWidth: { value: opts.width ?? 1.5 },
        uGhostWidth: { value: opts.ghostWidth ?? 1 },
        uHead: { value: 0 },
        uAlpha: { value: opts.alpha ?? 0.9 },
        uGhostAlpha: { value: opts.ghostAlpha ?? 0.16 },
        uDash: { value: opts.dash ?? 7 },
        uColorA: { value: new THREE.Color(0x141416) },
        uColorB: { value: new THREE.Color(0xecece9) },
        uNightY: { value: new THREE.Vector2(1e9, 1e9 + 1) },
        uFade: { value: 1 },
        uTail: { value: -1e9 },
        uClip: { value: new THREE.Vector4(0, 0, 0, 0) },
        uTime: { value: 0 },
        uPlucks: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -10, 0, 0)) },
        uPull: { value: new THREE.Vector2() },
        uHeadLen: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Points in px (document space for page lines, screen space for overlays). */
  setPoints(pts: Pt[], closed = false) {
    const n = pts.length + (closed ? 1 : 0);
    if (n < 2) { this.geometry.setDrawRange(0, 0); this.total = 0; return; }
    if (n > this.cap) this.allocate(Math.ceil(n * 1.25));
    const pos = this.geometry.getAttribute('aPos') as THREE.BufferAttribute;
    const nor = this.geometry.getAttribute('aNormal') as THREE.BufferAttribute;
    const len = this.geometry.getAttribute('aLen') as THREE.BufferAttribute;
    const P = (i: number) => pts[closed ? i % pts.length : i];
    let L = 0;
    for (let i = 0; i < n; i++) {
      const p = P(i);
      if (i > 0) { const q = P(i - 1); L += Math.hypot(p.x - q.x, p.y - q.y); }
      const a = i > 0 ? P(i - 1) : closed ? P(pts.length - 1) : p;
      const b = i < n - 1 ? P(i + 1) : closed ? P(1) : p;
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s;
        pos.setXY(k, p.x, p.y);
        nor.setXY(k, -ty, tx);
        len.setX(k, L);
      }
    }
    pos.needsUpdate = nor.needsUpdate = len.needsUpdate = true;
    this.total = L;
    this.geometry.setDrawRange(0, (n - 1) * 6);
  }

  private allocate(cap: number) {
    this.cap = cap;
    const g = this.geometry;
    g.setAttribute('aPos', new THREE.BufferAttribute(new Float32Array(cap * 4), 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aNormal', new THREE.BufferAttribute(new Float32Array(cap * 4), 2).setUsage(THREE.DynamicDrawUsage));
    const side = new Float32Array(cap * 2);
    for (let i = 0; i < cap; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aLen', new THREE.BufferAttribute(new Float32Array(cap * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array((cap - 1) * 6);
    for (let i = 0; i < cap - 1; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    // positions are placed in the vertex shader, so a bounding sphere is irrelevant
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  }

  private pi = 0;
  /** Strike the line at an arc length; it rings and sends two pulses away from the point. */
  pluck(len: number, amp: number, dir: number, time: number) {
    (this.material.uniforms.uPlucks.value as THREE.Vector4[])[this.pi].set(len, time, amp, dir);
    this.pi = (this.pi + 1) % 6;
  }

  frame(vw: number, vh: number, dpr: number, scroll: number, time = 0) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uViewport.value.set(vw, vh);
    u.uDpr.value = dpr;
    u.uScroll.value = scroll;
  }
}

/** A small filled disc, for the satellite on the hero orbit and the tip of a line. */
export class Dot {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  constructor(color = 0x141416) {
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uViewport: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2() },
        uRadius: { value: 3 },
        uDpr: { value: 1 },
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform vec2 uViewport; uniform vec2 uCenter; uniform float uRadius;
        varying vec2 vP;
        void main() {
          vP = position.xy * (uRadius + 2.0);
          vec2 p = uCenter + vP;
          gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uRadius; uniform float uDpr; uniform vec3 uColor; uniform float uAlpha;
        varying vec2 vP;
        void main() {
          float d = length(vP) - uRadius;
          gl_FragColor = vec4(uColor, clamp(0.5 - d * uDpr, 0.0, 1.0) * uAlpha);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
  }
  set(x: number, y: number, r: number, alpha: number, vw: number, vh: number, dpr: number) {
    const u = this.material.uniforms;
    u.uViewport.value.set(vw, vh);
    u.uCenter.value.set(x, y);
    u.uRadius.value = r;
    u.uDpr.value = dpr;
    u.uAlpha.value = alpha;
    this.mesh.visible = alpha > 0.002;
  }
}

/**
 * The bead at the head of the line: a drop of ink that stretches along the way it is moving, and
 * a ring around it that swells when it passes a step or is touched.
 */
export class Bead {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uViewport: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2() },
        uRadius: { value: 6 },
        uDpr: { value: 1 },
        uColor: { value: new THREE.Color(0x141416) },
        uAlpha: { value: 1 },
        uDir: { value: new THREE.Vector2(1, 0) },
        uStretch: { value: 1 },
        uRing: { value: new THREE.Vector3(0, 0, 0) }, // radius, alpha, width
      },
      vertexShader: /* glsl */ `
        uniform vec2 uViewport; uniform vec2 uCenter; uniform float uRadius; uniform float uStretch; uniform vec3 uRing;
        varying vec2 vP;
        void main() {
          float ext = max(uRadius * uStretch, uRing.x + uRing.z) + 3.0;
          vP = position.xy * ext;
          vec2 p = uCenter + vP;
          gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uRadius; uniform float uDpr; uniform vec3 uColor; uniform float uAlpha;
        uniform vec2 uDir; uniform float uStretch; uniform vec3 uRing;
        varying vec2 vP;
        void main() {
          // squash and stretch: long along the motion, thin across it, same area
          vec2 d = normalize(uDir);
          vec2 q = vec2(dot(vP, d) / uStretch, dot(vP, vec2(-d.y, d.x)) * uStretch);
          float body = length(q) - uRadius;
          float a = clamp(0.5 - body * uDpr, 0.0, 1.0);
          float ring = abs(length(vP) - uRing.x) - uRing.z * 0.5;
          a = max(a, clamp(0.5 - ring * uDpr, 0.0, 1.0) * uRing.y);
          gl_FragColor = vec4(uColor, a * uAlpha);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
  }
}
