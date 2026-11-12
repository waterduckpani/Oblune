import * as THREE from 'three';

/** A point the ribbon passes through, in page CSS px (y down) with a depth: + toward you, - into the page. */
export type RibbonPoint = { x: number; y: number; z?: number };

const RADIAL = 18;
const STEP = 5; // px of curve between rings

/**
 * An orbit round something, as one open stroke: along a tilted ellipse from angle a0 to a1 (screen
 * axes, y down; decreasing angles run anticlockwise on screen), behind at the top and in front at the
 * bottom, with straight lead-ins and lead-outs along its tangents so it joins the rest of the route
 * without a kink. It never closes, so no strand crosses another.
 */
export function orbit(out: RibbonPoint[], c: { x: number; y: number }, ex: number, ey: number, rot: number, a0: number, a1: number, depth: number, leadIn: number, leadOut: number, steps = 40) {
  const at = (a: number) => {
    const x = Math.cos(a) * ex, y = Math.sin(a) * ey;
    return { x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot), z: Math.sin(a) * depth };
  };
  const tangent = (a: number) => {
    const s = Math.sign(a1 - a0);
    const dx = -Math.sin(a) * ex * s, dy = Math.cos(a) * ey * s;
    const tx = dx * Math.cos(rot) - dy * Math.sin(rot), ty = dx * Math.sin(rot) + dy * Math.cos(rot);
    const l = Math.hypot(tx, ty) || 1;
    return { x: tx / l, y: ty / l };
  };
  const p0 = at(a0), t0 = tangent(a0), p1 = at(a1), t1 = tangent(a1);
  if (leadIn > 0) out.push({ x: p0.x - t0.x * leadIn, y: p0.y - t0.y * leadIn, z: p0.z }, { x: p0.x - t0.x * leadIn * 0.4, y: p0.y - t0.y * leadIn * 0.4, z: p0.z });
  for (let i = 0; i <= steps; i++) out.push(at(a0 + ((a1 - a0) * i) / steps));
  if (leadOut > 0) out.push({ x: p1.x + t1.x * leadOut, y: p1.y + t1.y * leadOut, z: p1.z });
}

const VERT = /* glsl */ `
attribute vec3 aCenter; attribute float aLen; attribute vec2 aPerp;
uniform float uHead; uniform float uTail; uniform float uRadius; uniform float uTime; uniform vec4 uPluck; uniform vec2 uPin;
varying vec3 vN;
varying vec2 vPage;
void main() {
  vec3 p = position;
  // a pen's stroke, not a cut cable: over its last stretch at each end the tube thins to a fine,
  // rounded point, so wherever the drawing has got to, it ends in a tip
  float toHead = max(uHead - aLen, 0.0);
  float toTail = max(aLen - uTail, 0.0);
  float taper = uRadius * 8.0;
  float k = clamp(min(toHead, toTail) / taper, 0.0, 1.0);
  float body = 1.0 - pow(1.0 - k, 2.2);
  // and the last radius of the point closes like a hemisphere
  float tipR = uRadius * 0.16;
  float e = min(toHead, toTail);
  float tip = e < tipR ? sqrt(max(0.0, 1.0 - pow(1.0 - e / tipR, 2.0))) : 1.0;
  p = aCenter + (p - aCenter) * max(mix(0.14, 1.0, body) * tip, 0.02);
  // plucked: a damped standing wave around where it was struck, travelling outward
  float age = uTime - uPluck.y;
  if (age > 0.0 && age < 2.5) {
    float d = abs(aLen - uPluck.x);
    float env = exp(-d / 260.0) * exp(-age * 2.4);
    p.xy += aPerp * uPluck.z * uPluck.w * env * sin(age * 38.0 - d * 0.018);
  }
  // the part inside a pinned section rides with it; the stretch before it eases in
  p.y -= uPin.y * smoothstep(uPin.x - 500.0, uPin.x, aLen);
  vN = normalize(normalMatrix * normal);
  vPage = vec2(p.x, -p.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

// Shaded like a printed object, not a rubber cable: a body that lifts toward one soft light from the
// upper left, one fine highlight running along it, and a faint edge. Ink by day, silver at night.
const FRAG = /* glsl */ `
uniform vec3 uDayBase; uniform vec3 uDayLift; uniform vec3 uNightBase; uniform vec3 uNightLift;
uniform float uNight; uniform float uOpacity;
uniform vec3 uNightDisc; uniform vec3 uDayDisc; uniform vec3 uDuskDisc; // centre x, y and radius, in page px
varying vec3 vN;
varying vec2 vPage;
void main() {
  vec3 n = normalize(vN);
  // silver wherever the line is inside the work's night (see Night.ts)
  float inNight = (1.0 - smoothstep(-1.5, 1.5, length(vPage - uNightDisc.xy) - uNightDisc.z))
    * smoothstep(-1.5, 1.5, length(vPage - uDayDisc.xy) - uDayDisc.z);
  inNight = max(inNight, 1.0 - smoothstep(-1.5, 1.5, length(vPage - uDuskDisc.xy) - uDuskDisc.z));
  float k = max(uNight, inNight);
  vec3 uBase = mix(uDayBase, uNightBase, k), uLift = mix(uDayLift, uNightLift, k);
  float uSpec = mix(0.5, 0.35, k);
  vec3 l = normalize(vec3(-0.35, 0.78, 0.52));
  float d = dot(n, l) * 0.5 + 0.5;
  vec3 col = mix(uBase, uLift, pow(d, 2.4));
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 70.0);
  col += vec3(spec) * uSpec;
  float rim = pow(1.0 - max(n.z, 0.0), 3.0);
  col = mix(col, uLift, rim * 0.22);
  gl_FragColor = vec4(col, uOpacity);
}`;

const DAY = { base: new THREE.Color('#121316'), lift: new THREE.Color('#5a5e68'), spec: 0.5 };
const NIGHT = { base: new THREE.Color('#8e929b'), lift: new THREE.Color('#f4f5f7'), spec: 0.35 };

export class Ribbon {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Sampled centreline in page px (y down), and the arc length at each sample. */
  pts: { x: number; y: number; z: number }[] = [];
  lens: number[] = [];
  total = 0;
  private uniforms = {
    uHead: { value: 0 },
    uTail: { value: 0 },
    uRadius: { value: 14 },
    uTime: { value: 0 },
    uPluck: { value: new THREE.Vector4(0, -100, 0, 1) }, // length, start time, amplitude, side
    uPin: { value: new THREE.Vector2(1e9, 0) }, // from this length on, the ribbon rides with a pinned section: length, shift (px)
    uDayBase: { value: DAY.base }, uDayLift: { value: DAY.lift },
    uNightBase: { value: NIGHT.base }, uNightLift: { value: NIGHT.lift },
    uNight: { value: 0 },
    uNightDisc: { value: new THREE.Vector3(0, 0, 0) },
    uDayDisc: { value: new THREE.Vector3(0, 0, 0) },
    uDuskDisc: { value: new THREE.Vector3(0, 0, 0) },
    uOpacity: { value: 1 },
  };

  constructor(public radius = 14) {
    this.uniforms.uRadius.value = radius;
    // always blended (so it can fade without a recompile); drawn after the covers and before the moon,
    // and depth decides who is in front
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** The tube's thickness (applied on the next setRoute). */
  setRadius(r: number) { this.radius = r; this.uniforms.uRadius.value = r; }

  /** 0 by day (ink), 1 at night (silver), and anything between as the sky changes. */
  setNight(n: number) { this.uniforms.uNight.value = n; }

  /** The work's night, the day rising inside it and the dusk's night, as discs in page px (x, y, radius). */
  setDiscs(night: [number, number, number], day: [number, number, number], dusk: [number, number, number]) {
    this.uniforms.uNightDisc.value.set(...night);
    this.uniforms.uDayDisc.value.set(...day);
    this.uniforms.uDuskDisc.value.set(...dusk);
  }

  /**
   * Rebuild along a new route (on layout changes). The route's points are only a guide: the curve
   * through them is densified and smoothed (so no join can kink, however the points sit), resampled
   * every STEP px, and swept with rotation-minimising frames (so the tube never twists).
   */
  setRoute(route: RibbonPoint[]) {
    // 1. through the points, densely
    const guide = new THREE.CatmullRomCurve3(route.map((p) => new THREE.Vector3(p.x, -p.y, p.z ?? 0)), false, 'centripetal');
    guide.arcLengthDivisions = Math.max(200, Math.ceil(guide.getLength() / 4));
    const dense = guide.getSpacedPoints(Math.max(8, Math.ceil(guide.getLength() / 8)));
    // 2. smooth it: every corner rounds off to a radius of a few tens of px; the ends stay put
    const tmp = dense.map((v) => v.clone());
    for (let pass = 0; pass < 22; pass++) {
      for (let i = 1; i < dense.length - 1; i++) tmp[i].copy(dense[i - 1]).add(dense[i + 1]).multiplyScalar(0.25).addScaledVector(dense[i], 0.5);
      for (let i = 1; i < dense.length - 1; i++) dense[i].copy(tmp[i]);
    }
    // 3. resample every STEP px along it
    const pts: THREE.Vector3[] = [dense[0].clone()];
    let carry = 0;
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1], b = dense[i];
      const seg = a.distanceTo(b);
      let at = STEP - carry;
      while (at <= seg) { pts.push(a.clone().lerp(b, at / seg)); at += STEP; }
      carry = seg - (at - STEP);
    }
    if (pts[pts.length - 1].distanceTo(dense[dense.length - 1]) > 0.5) pts.push(dense[dense.length - 1].clone());
    const n = pts.length - 1;
    // 4. tangents, and frames carried along without twisting
    const tans = pts.map((_, i) => pts[Math.min(n, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
    const normals: THREE.Vector3[] = [], binormals: THREE.Vector3[] = [];
    let Nprev = new THREE.Vector3(0, 0, 1).cross(tans[0]);
    if (Nprev.lengthSq() < 1e-6) Nprev = new THREE.Vector3(1, 0, 0).cross(tans[0]);
    Nprev.normalize();
    const q = new THREE.Quaternion();
    for (let i = 0; i <= n; i++) {
      if (i > 0) { q.setFromUnitVectors(tans[i - 1], tans[i]); Nprev = Nprev.clone().applyQuaternion(q).normalize(); }
      normals.push(Nprev);
      binormals.push(tans[i].clone().cross(Nprev).normalize());
    }
    const pos = new Float32Array((n + 1) * RADIAL * 3);
    const nor = new Float32Array((n + 1) * RADIAL * 3);
    const cen = new Float32Array((n + 1) * RADIAL * 3);
    const lens = new Float32Array((n + 1) * RADIAL);
    const perp = new Float32Array((n + 1) * RADIAL * 2);
    this.pts = []; this.lens = [];
    const N = new THREE.Vector3();
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      const P = pts[i], T = tans[i];
      if (i) acc += P.distanceTo(pts[i - 1]);
      this.pts.push({ x: P.x, y: -P.y, z: P.z });
      this.lens.push(acc);
      const Nf = normals[i], Bf = binormals[i];
      // the direction a pluck pushes it: across the tube, in the page's plane
      const pl = Math.hypot(T.x, T.y) || 1;
      const px = -T.y / pl, py = T.x / pl;
      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        N.set(0, 0, 0).addScaledVector(Nf, Math.cos(a)).addScaledVector(Bf, Math.sin(a)).normalize();
        const k = (i * RADIAL + j);
        pos[k * 3] = P.x + N.x * this.radius; pos[k * 3 + 1] = P.y + N.y * this.radius; pos[k * 3 + 2] = P.z + N.z * this.radius;
        nor[k * 3] = N.x; nor[k * 3 + 1] = N.y; nor[k * 3 + 2] = N.z;
        cen[k * 3] = P.x; cen[k * 3 + 1] = P.y; cen[k * 3 + 2] = P.z;
        lens[k] = acc;
        perp[k * 2] = px; perp[k * 2 + 1] = py;
      }
    }
    this.total = acc;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * RADIAL + j, b = i * RADIAL + ((j + 1) % RADIAL);
        const c = (i + 1) * RADIAL + j, d = (i + 1) * RADIAL + ((j + 1) % RADIAL);
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
    g.setAttribute('aLen', new THREE.BufferAttribute(lens, 1));
    g.setAttribute('aPerp', new THREE.BufferAttribute(perp, 2));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.setHead(this.uniforms.uHead.value);
  }

  private ring(len: number) {
    let lo = 0, hi = this.lens.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.lens[m] <= len) lo = m; else hi = m - 1; }
    return lo;
  }
  private range() {
    const a = this.ring(this.uniforms.uTail.value), b = this.ring(this.uniforms.uHead.value);
    this.mesh.geometry.setDrawRange(a * RADIAL * 6, Math.max(0, b - a) * RADIAL * 6);
    this.mesh.visible = b > a && this.uniforms.uOpacity.value > 0.003;
  }
  /** Draw the ribbon up to this arc length. */
  setHead(len: number) {
    this.uniforms.uHead.value = Math.max(0, Math.min(this.total, len));
    this.range();
  }
  /** Draw it from this arc length on (a travelling segment, when it rises with the head). */
  setTail(len: number) {
    this.uniforms.uTail.value = Math.max(0, Math.min(this.total, len));
    this.range();
  }
  get head() { return this.uniforms.uHead.value; }
  get tail() { return this.uniforms.uTail.value; }

  get opacity() { return this.uniforms.uOpacity.value; }
  set opacity(v: number) { this.uniforms.uOpacity.value = v; this.mesh.visible = v > 0.003 && this.head > this.uniforms.uTail.value; }

  /** The point at an arc length. */
  pointAt(len: number) {
    let lo = 0, hi = this.lens.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.lens[m] <= len) lo = m; else hi = m - 1; }
    return this.pts[lo] ?? { x: 0, y: 0, z: 0 };
  }

  tick(t: number) { this.uniforms.uTime.value = t; }

  /** From arc length `len` on, the ribbon is shifted down the page by `shift` px (riding a pinned section). */
  setPin(len: number, shift: number) { this.uniforms.uPin.value.set(len, shift); }

  /** Strike it at an arc length, pushed to one side. */
  pluck(len: number, amp: number, side: 1 | -1, t: number) {
    this.uniforms.uPluck.value.set(len, t, amp, side);
  }
  /** Still ringing? (then the stage keeps drawing) */
  ringing(t: number) { return t - this.uniforms.uPluck.value.y < 2.5; }
}
