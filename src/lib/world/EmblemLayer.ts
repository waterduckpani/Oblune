import * as THREE from 'three';
import { ENV_GLSL, SDF_GLSL } from './glsl';

/** Fraction of the quad's half-size that the emblem's radius fills (camera maths in the shader). */
export const EMBLEM_FILL = 1 / (4.2 * 0.37);

const VERT = /* glsl */ `
uniform vec4 uRect;      // x, y, w, h in CSS px, top-left origin
uniform vec2 uViewport;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec2 px = vec2(uRect.x + uv.x * uRect.z, uRect.y + (1.0 - uv.y) * uRect.w);
  gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSizePx;     // quad size in device pixels, for anti-aliasing
uniform float uTime;
uniform float uPhase;
uniform vec2 uTilt;
uniform vec2 uLight;
uniform float uShadow;
uniform float uAlpha;
uniform float uSteps;
uniform vec4 uRipples[4];  // x, y (quad-local, -1..1), start time, strength
uniform vec4 uDrops[6];   // droplets of the metal: x, y, z (world), radius
uniform float uBody;       // the emblem's own scale; 0 while it is still only droplets
uniform float uBound;      // squared radius of the sphere that holds everything
uniform float uNight;      // 0 by day (a soft shadow on the page), 1 at night (a glow)

const float HALF_DEPTH = 0.09;
const float ROUND = 0.03;
const float DOME = 0.045;
const float TILT_24 = -0.41887902;

${ENV_GLSL}
${SDF_GLSL}

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0, -s, c, 0, 0, 0, 1); }

float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

float map(vec3 p, mat3 invR) {
  float body = max(uBody, 0.001);
  vec3 q = invR * p / body;
  float d2 = sdEmblem2D(q.xy, uPhase) + ROUND;
  float h = HALF_DEPTH + DOME * (1.0 - clamp(dot(q.xy, q.xy), 0.0, 1.0)) - ROUND;
  vec2 w = vec2(d2, abs(q.z) - h);
  float d = (min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - ROUND) * body;
  if (uBody < 0.002) d = 1e3;
  for (int i = 0; i < 6; i++) {
    vec4 k = uDrops[i];
    if (k.w > 0.001) d = smin(d, length(p - k.xyz) - k.w, 0.2);
  }
  return d;
}

vec3 calcNormal(vec3 p, mat3 invR) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0006;
  return normalize(k.xyy * map(p + k.xyy * e, invR) + k.yyx * map(p + k.yyx * e, invR) +
                   k.yxy * map(p + k.yxy * e, invR) + k.xxx * map(p + k.xxx * e, invR));
}

vec3 tonemap(vec3 x) {
  x *= 0.9;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Liquid-metal ripples: a perturbation of the normal, radiating from where the pointer touched
vec2 ripple(vec2 uv) {
  vec2 g = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 3.5) continue;
    vec2 d = uv - r.xy;
    float dist = length(d);
    float wave = sin(dist * 30.0 - age * 10.0) * exp(-dist * 2.6) * exp(-age * 1.35) * smoothstep(0.0, 0.12, age);
    g += (d / max(dist, 1e-3)) * wave * r.w;
  }
  return g;
}

vec3 shade(vec3 p, vec3 rd, mat3 invR, vec2 uv) {
  vec3 n = calcNormal(p, invR);
  n = normalize(n + vec3(ripple(uv) * 0.2, 0.0));
  vec3 r = reflect(rd, n);
  float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 5.0);
  vec3 F = mix(vec3(0.90, 0.91, 0.93), vec3(1.0), fres);
  float ao = 0.55 + 0.45 * clamp(map(p + n * 0.06, invR) / 0.06, 0.0, 1.0);
  return pow(tonemap(studioEnv(r, uLight) * F * ao), vec3(1.0 / 2.2));
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  vec3 ro = vec3(0.0, 0.0, 4.2);
  vec3 rd = normalize(vec3(uv * 0.37, -1.0));
  mat3 R = rotY(uTilt.x) * rotX(uTilt.y) * rotZ(TILT_24);
  mat3 invR = transpose(R);

  float pixel = 2.0 / uSizePx * 0.37;
  float t = 0.0, minD = 1e9, tMin = 0.0;
  bool hit = false;
  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - uBound);
  if (disc > 0.0) {
    t = max(-b - sqrt(disc), 0.0);
    float tEnd = -b + sqrt(disc);
    for (int i = 0; i < 110; i++) {
      if (float(i) >= uSteps) break;
      vec3 p = ro + rd * t;
      float d = map(p, invR);
      float rel = d / (pixel * t);
      if (rel < minD) { minD = rel; tMin = t; }
      if (d < 0.00035 * t) { hit = true; break; }
      t += d * 0.85;
      if (t > tEnd) break;
    }
  }

  // soft drop shadow on the page, from the silhouette projected onto z = 0
  vec2 sp = uv * 0.37 * 4.2 - vec2(0.05, -0.11);
  float sd = uBody > 0.002 ? sdEmblem2D(transpose(mat2(cos(TILT_24), sin(TILT_24), -sin(TILT_24), cos(TILT_24))) * sp / uBody, uPhase) * uBody : 1e3;
  for (int i = 0; i < 6; i++) if (uDrops[i].w > 0.001) sd = min(sd, length(sp - uDrops[i].xy) - uDrops[i].w);
  float shadow = uShadow * (1.0 - smoothstep(-0.12, 0.2, sd)) * 0.13 * (1.0 - uNight);
  // at night the metal glows instead: a soft halo around the silhouette
  float sdG = sd;
  float glow = uNight * (exp(-max(sdG, 0.0) * 7.0) * 0.32 + exp(-max(sdG, 0.0) * 16.0) * 0.25);

  // one shading call: the hit, or the closest approach for an anti-aliased silhouette
  float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.2, minD);
  vec3 halo = vec3(0.86, 0.88, 0.93);
  if (cov <= 0.0) {
    float ga = shadow + glow;
    gl_FragColor = vec4(mix(vec3(0.0), halo, glow / max(ga, 1e-4)), ga * uAlpha);
    return;
  }
  vec3 col = shade(ro + rd * (hit ? t : tMin), rd, invR, uv);
  float under = shadow + glow;
  float alpha = cov + under * (1.0 - cov);
  vec3 underCol = mix(vec3(0.0), halo, glow / max(under, 1e-4));
  col = (col * cov + underCol * under * (1.0 - cov)) / max(alpha, 1e-3);
  gl_FragColor = vec4(col, alpha * uAlpha);
}`;

export type EmblemState = {
  rect: { x: number; y: number; w: number };
  phase: number;
  tilt: { x: number; y: number };
  light: { x: number; y: number };
  alpha: number;
  shadow: number;
  night: number;
  /** World-space droplets (moon radius = 1): x, y, z and radius. Radius 0 hides one. */
  drops: { x: number; y: number; z: number; r: number }[];
  /** The emblem's own scale, 0..1. */
  body: number;
};

/** The chrome moon, drawn as one screen-space quad positioned in CSS pixels. */
export class EmblemLayer {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  private ripples = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -10, 0));
  private rippleIndex = 0;

  constructor(steps: number) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRect: { value: new THREE.Vector4(0, 0, 100, 100) },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uSizePx: { value: 100 },
        uTime: { value: 0 },
        uPhase: { value: 12 / 35 },
        uTilt: { value: new THREE.Vector2() },
        uLight: { value: new THREE.Vector2() },
        uShadow: { value: 1 },
        uAlpha: { value: 1 },
        uSteps: { value: steps },
        uRipples: { value: this.ripples },
        uDrops: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
        uBody: { value: 1 },
        uBound: { value: 1.2544 },
        uNight: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  apply(s: EmblemState, vw: number, vh: number, dpr: number, time: number) {
    const u = this.material.uniforms;
    u.uRect.value.set(s.rect.x, s.rect.y, s.rect.w, s.rect.w);
    u.uViewport.value.set(vw, vh);
    u.uSizePx.value = s.rect.w * dpr;
    u.uTime.value = time;
    u.uPhase.value = s.phase;
    u.uTilt.value.set(s.tilt.x, s.tilt.y);
    u.uLight.value.set(s.light.x, s.light.y);
    u.uAlpha.value = s.alpha;
    u.uShadow.value = s.shadow;
    u.uNight.value = s.night;
    let bound = 1.2544 * s.body * s.body;
    (u.uDrops.value as THREE.Vector4[]).forEach((v, i) => {
      const d = s.drops[i];
      if (d && d.r > 0.001) { v.set(d.x, d.y, d.z, d.r); bound = Math.max(bound, Math.pow(Math.hypot(d.x, d.y, d.z) + d.r + 0.25, 2)); }
      else v.set(0, 0, 0, 0);
    });
    u.uBody.value = s.body;
    u.uBound.value = Math.min(bound, 2.4);
  }

  /** x, y in quad-local units (-1..1, y up). */
  ripple(x: number, y: number, strength: number, time: number) {
    this.ripples[this.rippleIndex].set(x, y, time, strength);
    this.rippleIndex = (this.rippleIndex + 1) % this.ripples.length;
  }
}
