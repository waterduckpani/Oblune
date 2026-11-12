import * as THREE from 'three';
import { R_IN, R_OUT, RY, toA } from '../phase';

/**
 * The Oblune moon as real geometry, built from the same phase maths as the logo (lib/phase.ts).
 * Units: the outer radius is 1. A coin of half-depth H whose every edge is rounded with a bevel of
 * radius B: the outer rim, and the walls of the crescent window. The window's two tips get round
 * joins, so a bevel can never fold over itself there.
 *
 * Two geometries come out: the faces (front and back, flat, shaded as a shallow dome in the material)
 * and the walls with their bevels (normals written here, continuous with that dome).
 */
export const H = 0.105;
export const B = 0.068;
/** The faces are shaded as a dome z = DOME * (1 - r²): its normal tilts by up to atan(2 * DOME) at the rim. */
export const DOME = 0.3;

const RIN = R_IN / R_OUT;
const RYN = RY / R_OUT;
const SEG = 10;        // bevel segments
const N_OUT = 220;     // points around the outer rim
const N_WIN = 150;     // points along the window's boundary
const N_TIP = 9;       // points in each tip's round join

type V2 = { x: number; y: number };

const domeN = (x: number, y: number, s: number) => {
  const n = new THREE.Vector3(2 * DOME * x * s * s, 2 * DOME * y * s * s, 1);
  return n.normalize();
};

/**
 * The window's boundary, counter-clockwise, as points with the normal pointing out of the window
 * (into the metal). Tips carry a fan of normals so offsets round them off. Null when there is none.
 */
function windowLoop(lit: number): { p: V2; n: V2 }[] | null {
  const A = toA(lit) / R_OUT;
  if (A >= RIN - 0.004) return null;
  const out: { p: V2; n: V2 }[] = [];
  if (A <= -RIN + 0.004) {
    for (let i = 0; i < N_WIN; i++) {
      const t = (i / N_WIN) * Math.PI * 2;
      out.push({ p: { x: Math.cos(t) * RIN, y: Math.sin(t) * RIN }, n: { x: Math.cos(t), y: Math.sin(t) } });
    }
    return out;
  }
  const a = Math.max(Math.abs(A), 0.002);
  const s = A >= 0 ? -1 : 1; // which half of the terminator ellipse bounds the window
  const yc = Math.sqrt(Math.max(0, Math.min(RIN * RIN, (RIN * RIN - a * a) / (1 - (a * a) / (RYN * RYN)))));
  const xc = s * a * Math.sqrt(Math.max(0, 1 - (yc * yc) / (RYN * RYN)));
  const phi0 = Math.atan2(yc, xc);
  const phi1 = Math.PI * 2 - phi0;
  // share the points between the two arcs by their lengths
  const arcLen = RIN * (phi1 - phi0);
  const ellLen = 2 * yc * 1.15;
  const nArc = Math.max(24, Math.round((N_WIN * arcLen) / (arcLen + ellLen)));
  const nEll = Math.max(16, N_WIN - nArc);
  const circ: { p: V2; n: V2 }[] = [];
  for (let i = 0; i <= nArc; i++) {
    const t = phi0 + ((phi1 - phi0) * i) / nArc;
    circ.push({ p: { x: Math.cos(t) * RIN, y: Math.sin(t) * RIN }, n: { x: Math.cos(t), y: Math.sin(t) } });
  }
  // the ellipse, bottom to top; parametrised by angle so the points crowd where it curves
  const ell: { p: V2; n: V2 }[] = [];
  const t0 = Math.asin(Math.max(-1, Math.min(1, -yc / RYN))), t1 = -t0;
  for (let i = 0; i <= nEll; i++) {
    const t = t0 + ((t1 - t0) * i) / nEll;
    const x = s * a * Math.cos(t), y = RYN * Math.sin(t);
    // normal of the ellipse (x/a)² + (y/RY)² = 1 is (x/a², y/RY²); the metal is inside it when A >= 0
    let nx = x / (a * a), ny = y / (RYN * RYN);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    // pointing into the metal: for A >= 0 the metal is the ellipse's inside, so flip the outward normal
    if (A >= 0) { nx = -nx; ny = -ny; }
    ell.push({ p: { x, y }, n: { x: nx, y: ny } });
  }
  // the window, CCW: down the circle arc (top → left → bottom), a round tip, up the ellipse, a round tip
  const fan = (p: V2, from: V2, to: V2) => {
    let a0 = Math.atan2(from.y, from.x), a1 = Math.atan2(to.y, to.x);
    // the join turns the short way through the outside of the corner
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    for (let i = 1; i < N_TIP; i++) {
      const t = a0 + (d * i) / N_TIP;
      out.push({ p, n: { x: Math.cos(t), y: Math.sin(t) } });
    }
  };
  circ.forEach((c) => out.push(c));
  fan(circ[circ.length - 1].p, circ[circ.length - 1].n, ell[0].n);
  ell.slice(1, -1).forEach((e) => out.push(e));
  // the ellipse's top end is the circle's first point
  fan(circ[0].p, ell[ell.length - 1].n, circ[0].n);
  // drop the duplicate closing point of the arc's start (the loop closes on itself)
  return out;
}

/** The outer rim: a circle, normals outward. */
function rimLoop(): { p: V2; n: V2 }[] {
  const out: { p: V2; n: V2 }[] = [];
  for (let i = 0; i < N_OUT; i++) {
    const t = (i / N_OUT) * Math.PI * 2;
    out.push({ p: { x: Math.cos(t), y: Math.sin(t) }, n: { x: Math.cos(t), y: Math.sin(t) } });
  }
  return out;
}

/**
 * Sweeps a rounded profile around a closed loop. `inward` is +1 when the metal lies against the
 * normal (the rim: the normal points out of the metal), -1 when it lies along it (the window).
 * Returns the face boundary (the loop offset by the bevel) for the face triangulation.
 */
function sweep(loop: { p: V2; n: V2 }[], metalAlongNormal: boolean, bevel: number, pos: number[], nor: number[], idx: number[]) {
  const sgn = metalAlongNormal ? 1 : -1; // direction from the edge into the metal is sgn * n
  // profile, from the back face to the front face: back bevel, straight wall, front bevel
  type P = { off: number; z: number; t: number; side: -1 | 0 | 1 };
  const prof: P[] = [];
  for (let k = SEG; k >= 0; k--) { const th = (k / SEG) * (Math.PI / 2); prof.push({ off: bevel * (1 - Math.cos(th)), z: -(H - bevel) - bevel * Math.sin(th), t: k / SEG, side: -1 }); }
  for (let k = 0; k <= SEG; k++) { const th = (k / SEG) * (Math.PI / 2); prof.push({ off: bevel * (1 - Math.cos(th)), z: (H - bevel) + bevel * Math.sin(th), t: k / SEG, side: 1 }); }
  const base = pos.length / 3;
  const ring = prof.length;
  for (const v of loop) {
    // the normal of the wall, pointing out of the metal
    const wx = -sgn * v.n.x, wy = -sgn * v.n.y;
    for (const pr of prof) {
      const x = v.p.x + sgn * v.n.x * pr.off, y = v.p.y + sgn * v.n.y * pr.off;
      pos.push(x, y, pr.z);
      // from the wall's normal to the dome's, along the quarter circle
      const wall = new THREE.Vector3(wx, wy, 0);
      const face = domeN(x, y, 1);
      if (pr.side < 0) face.set(face.x, face.y, -face.z);
      const th = pr.t * (Math.PI / 2);
      const n = wall.multiplyScalar(Math.cos(th)).add(face.multiplyScalar(Math.sin(th))).normalize();
      nor.push(n.x, n.y, n.z);
    }
  }
  const L = loop.length;
  for (let i = 0; i < L; i++) {
    const a = base + i * ring, b = base + ((i + 1) % L) * ring;
    for (let k = 0; k < ring - 1; k++) {
      // wind so the outside of the metal faces out
      if (metalAlongNormal) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
      else idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
  }
  return loop.map((v) => ({ x: v.p.x + sgn * v.n.x * bevel, y: v.p.y + sgn * v.n.y * bevel }));
}

export function buildMoon(lit: number) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const rim = sweep(rimLoop(), false, B, pos, nor, idx);
  const win = windowLoop(lit);
  // a thin window gets a thinner bevel, so its two walls never meet
  const A = toA(lit) / R_OUT;
  const widest = win ? Math.max(0.01, RIN - Math.max(A, -RIN)) : 1;
  const wb = Math.min(B, widest * 0.42);
  let hole: V2[] | null = null;
  if (win) {
    hole = sweep(win, true, wb, pos, nor, idx);
    // the window bevel's face edge carries the full bevel's z: lift the slimmer bevel to the same face height
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  walls.setIndex(idx);

  // the faces: the rim's inner edge, with the window's edge as a hole
  const contour = rim.map((p) => new THREE.Vector2(p.x, p.y));
  const holes = hole ? [dedupe(hole).map((p) => new THREE.Vector2(p.x, p.y)).reverse()] : [];
  const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  const all = [...contour, ...holes.flat()];
  const fpos: number[] = [], fnor: number[] = [], fidx: number[] = [];
  for (const side of [1, -1]) {
    const base = fpos.length / 3;
    for (const p of all) { fpos.push(p.x, p.y, side * H); fnor.push(0, 0, side); }
    for (const t of tris) {
      // counter-clockwise seen from the side the face looks out of
      const [a, b, c] = t.map((i) => all[i]);
      const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
      if (ccw === side > 0) fidx.push(base + t[0], base + t[1], base + t[2]);
      else fidx.push(base + t[0], base + t[2], base + t[1]);
    }
  }
  const faces = new THREE.BufferGeometry();
  faces.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  faces.setAttribute('normal', new THREE.Float32BufferAttribute(fnor, 3));
  faces.setIndex(fidx);
  return { walls, faces };
}

/** The round joins repeat a point; the triangulation wants each point once. */
function dedupe(pts: V2[]) {
  const out: V2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  return out;
}
