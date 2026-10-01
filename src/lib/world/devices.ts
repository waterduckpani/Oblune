import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Device specs in units of screen width (screen width = 1).
 * The phone matches an iPhone 17 Pro display (1206 x 2622 px); the plate matches a desktop
 * capture with its toolbar (2880 x 1888 px). Textures are cut to these exact ratios.
 */
export const SPECS = {
  phone: { sh: 2622 / 1206, rs: 0.135, bezel: 0.034, rim: 0.022, depth: 0.108, bevel: 0.03 },
  plate: { sh: 1888 / 2880, rs: 0.006, bezel: 0.014, rim: 0.012, depth: 0.03, bevel: 0.01 },
} as const;
export type DeviceKind = keyof typeof SPECS;

// The hardware camera cutout, positioned where iOS draws it (screen uv, top-left origin)
const ISLAND = new THREE.Vector4(0.5, 96 / 2622, 378 / 1206, 112 / 2622);

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SCREEN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4 uXformA;   // uv scale (xy) and offset (zw)
uniform vec4 uXformB;
uniform float uMix;     // 0 shows A, 1 shows B
uniform float uMode;    // 0 push across (navigation), 1 rise up (a sheet), 2 crossfade
uniform float uBright;
uniform float uSheen;
uniform float uReadyA;
uniform float uReadyB;
uniform float uIsland;
uniform vec4 uIslandRect;
uniform vec2 uGlass;
uniform vec2 uScreen;
uniform float uRGlass;
uniform float uRScreen;
uniform vec3 uBlank;

float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

vec3 screenA(vec2 uv) { return mix(uBlank, texture2D(uTexA, uv * uXformA.xy + uXformA.zw).rgb, uReadyA); }
vec3 screenB(vec2 uv) { return mix(uBlank, texture2D(uTexB, uv * uXformB.xy + uXformB.zw).rgb, uReadyB); }

void main() {
  vec2 p = (vUv - 0.5) * uGlass;
  float dG = sdRR(p, uGlass * 0.5, uRGlass);
  float aG = fwidth(dG);
  float outer = 1.0 - smoothstep(-aG, aG, dG);
  if (outer < 0.002) discard;

  float dS = sdRR(p, uScreen * 0.5, uRScreen);
  float aS = fwidth(dS);
  float inScreen = 1.0 - smoothstep(-aS, aS, dS);
  vec2 suv = p / uScreen + 0.5;

  float m = uMix;
  float e = m * m * (3.0 - 2.0 * m);
  vec3 col;
  if (m <= 0.0005) {
    col = screenA(suv);
  } else if (uMode < 0.5) {
    // the next screen slides in from the right; the last one drifts left and dims beneath it
    float edge = 1.0 - e;
    vec3 a = screenA(suv + vec2(e * 0.3, 0.0)) * (1.0 - 0.45 * e);
    vec3 b = screenB(suv - vec2(edge, 0.0));
    float inB = smoothstep(edge - 0.002, edge + 0.002, suv.x);
    float shade = exp(-max(edge - suv.x, 0.0) * 40.0) * 0.25 * (1.0 - inB) * step(0.001, e);
    col = mix(a * (1.0 - shade), b, inB);
  } else if (uMode < 1.5) {
    // a sheet rises from the bottom over the last screen
    float Y = 1.0 - suv.y;
    float top = 1.0 - e;
    vec3 a = screenA(suv) * (1.0 - 0.5 * e);
    vec3 b = screenB(vec2(suv.x, 1.0 - (Y - top)));
    float inB = smoothstep(top - 0.002, top + 0.002, Y);
    col = mix(a, b, inB);
  } else {
    col = mix(screenA(suv), screenB(suv), e);
  }
  col *= uBright;

  vec2 ip = (vec2(suv.x, 1.0 - suv.y) - uIslandRect.xy) * uScreen;
  float dI = sdRR(ip, uIslandRect.zw * uScreen * 0.5, uIslandRect.w * uScreen.y * 0.5);
  col = mix(col, vec3(0.0), (1.0 - smoothstep(-aS, aS, dI)) * uIsland);

  vec3 outc = mix(vec3(0.008), col, inScreen);
  float band = exp(-pow((suv.x * 0.7 + (1.0 - suv.y) * 0.9 - uSheen) / 0.3, 2.0));
  outc += vec3(band * 0.035) * inScreen + vec3(band * 0.06) * (1.0 - inScreen);
  gl_FragColor = vec4(outc, outer);
  #include <colorspace_fragment>
}`;

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

const cache = new Map<string, THREE.BufferGeometry>();
function bodyGeometry(kind: DeviceKind) {
  if (cache.has(kind)) return cache.get(kind)!;
  const s = SPECS[kind];
  const pad = s.bezel + s.rim;
  const w = 1 + pad * 2, h = s.sh + pad * 2, r = s.rs + pad;
  const bs = s.bevel * 0.6;
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - bs * 2, h - bs * 2, r - bs), {
    depth: s.depth - s.bevel * 2,
    bevelEnabled: true,
    bevelThickness: s.bevel,
    bevelSize: bs,
    bevelSegments: 8,
    curveSegments: 20,
  });
  geo.translate(0, 0, -(s.depth - s.bevel * 2) / 2);
  geo.computeVertexNormals();
  cache.set(kind, geo);
  return geo;
}

let blank: THREE.DataTexture | null = null;
const blankTexture = () => {
  if (!blank) {
    blank = new THREE.DataTexture(new Uint8Array([8, 8, 9, 255]), 1, 1);
    blank.needsUpdate = true;
  }
  return blank;
};

export const metal = new THREE.MeshStandardMaterial({ color: '#e6e8eb', metalness: 1, roughness: 0.17 });

/** A phone or a display plate, in units of screen width. Scale the group to set its size in px. */
export class Device {
  group = new THREE.Group();
  /** Local animation layer, so choreography and pointer tilt compose cleanly. */
  inner = new THREE.Group();
  screen: THREE.ShaderMaterial;
  body: THREE.Mesh;
  spec: (typeof SPECS)[DeviceKind];
  height: number;

  constructor(public kind: DeviceKind, opts: { island?: boolean } = {}) {
    const s = (this.spec = SPECS[kind]);
    const glassW = 1 + s.bezel * 2, glassH = s.sh + s.bezel * 2;
    this.height = s.sh + (s.bezel + s.rim) * 2;
    this.body = new THREE.Mesh(bodyGeometry(kind), metal);
    this.inner.add(this.body);

    this.screen = new THREE.ShaderMaterial({
      vertexShader: SCREEN_VERT,
      fragmentShader: SCREEN_FRAG,
      transparent: true,
      uniforms: {
        uTexA: { value: blankTexture() },
        uTexB: { value: blankTexture() },
        uXformA: { value: new THREE.Vector4(1, 1, 0, 0) },
        uXformB: { value: new THREE.Vector4(1, 1, 0, 0) },
        uMix: { value: 0 },
        uMode: { value: 0 },
        uBlank: { value: new THREE.Color(0.035, 0.035, 0.04) },
        uBright: { value: 1 },
        uSheen: { value: 0.4 },
        uReadyA: { value: 0 },
        uReadyB: { value: 0 },
        uIsland: { value: kind === 'phone' && opts.island !== false ? 1 : 0 },
        uIslandRect: { value: ISLAND },
        uGlass: { value: new THREE.Vector2(glassW, glassH) },
        uScreen: { value: new THREE.Vector2(1, s.sh) },
        uRGlass: { value: s.rs + s.bezel },
        uRScreen: { value: s.rs },
      },
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, glassH), this.screen);
    glass.position.z = s.depth / 2 + 0.0015;
    glass.renderOrder = 1;
    this.inner.add(glass);

    if (kind === 'phone') {
      // side buttons: action and volume on the left, power on the right
      const btn = (h: number) => new THREE.Mesh(new RoundedBoxGeometry(0.018, h, 0.04, 2, 0.008), metal);
      const x = 0.5 + s.bezel + s.rim + 0.004;
      [[-x, 0.62, 0.1], [-x, 0.38, 0.19], [-x, 0.12, 0.19], [x, 0.32, 0.3]].forEach(([bx, by, bh]) => {
        const b = btn(bh);
        b.position.set(bx, by, 0);
        this.inner.add(b);
      });
    }
    this.group.add(this.inner);
  }

  /** Show texture A, B, or a transition between them. Pass null for a dark screen. */
  set(a: THREE.Texture | null, b: THREE.Texture | null, mix: number, mode: 'push' | 'rise' | 'fade' = 'push') {
    const u = this.screen.uniforms;
    u.uMode.value = mode === 'push' ? 0 : mode === 'rise' ? 1 : 2;
    u.uTexA.value = a ?? blankTexture();
    u.uTexB.value = b ?? a ?? blankTexture();
    u.uReadyA.value = a ? 1 : 0;
    u.uReadyB.value = b ? 1 : a ? 1 : 0;
    u.uMix.value = b ? mix : 0;
  }

  /** Scroll or crop a texture inside the screen (uv scale and offset). */
  xform(which: 'A' | 'B', sx: number, sy: number, ox: number, oy: number) {
    this.screen.uniforms[which === 'A' ? 'uXformA' : 'uXformB'].value.set(sx, sy, ox, oy);
  }
}
