import * as THREE from 'three';

// A full-screen layer behind everything on the stage (the covers, the line and the moon draw over it).
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;

// Night is a disc rising from below the screen; day comes back as a second disc rising inside it,
// and the dusk's night is a third, which keeps the screen to the end of the page.
// The night's edge carries a thin silver rim, like the sun's light round an eclipse, and the dark
// lifts a little as the day nears, like dawn. Stars drift with the scroll, slower than the page.
const FRAG = /* glsl */ `
uniform vec2 uView;      // css px
uniform vec3 uNight;     // centre x, y (css px, y down), radius
uniform vec3 uDay;
uniform vec3 uDusk;
uniform float uScroll;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uView;
  float dn = length(p - uNight.xy) - uNight.z;
  float dd = length(p - uDay.xy) - uDay.z;
  float dk = length(p - uDusk.xy) - uDusk.z;
  float inDusk = 1.0 - smoothstep(-0.8, 0.8, dk);
  float a = max((1.0 - smoothstep(-0.8, 0.8, dn)) * smoothstep(-0.8, 0.8, dd), inDusk);
  if (a <= 0.0) discard;
  vec3 col = vec3(0.039, 0.039, 0.047);
  // stars
  vec2 sp = (p + vec2(0.0, uScroll * 0.12)) / 34.0;
  vec2 cell = floor(sp);
  float h = hash(cell);
  vec2 off = (vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5) * 0.6;
  float star = step(0.94, h) * smoothstep(0.05, 0.0, length(fract(sp) - 0.5 - off));
  col += vec3(0.9, 0.91, 0.95) * star * (0.35 + (h - 0.94) * 10.0);
  // the eclipse rim on the night's edge: a hairline and a soft glow behind it
  float de = mix(dn, dk, inDusk);
  col += vec3(0.86, 0.88, 0.93) * (exp(-abs(de) / 3.0) * 0.7 + exp(-abs(de) / 70.0) * 0.07);
  // dawn: the dark lifts toward the rising day, which has a rim of its own
  float dawn = (uDay.z > 0.0 ? exp(-max(dd, 0.0) / 220.0) : 0.0) * (1.0 - inDusk);
  col = mix(col, vec3(0.42, 0.42, 0.41), dawn * 0.4);
  col += vec3(0.95) * exp(-abs(dd) / 3.0) * 0.35 * (1.0 - inDusk);
  gl_FragColor = vec4(col, a);
}`;

export type Disc = [number, number, number];

export class Night {
  mesh: THREE.Mesh;
  private u = {
    uView: { value: new THREE.Vector2(1, 1) },
    uNight: { value: new THREE.Vector3(0, 0, 0) },
    uDay: { value: new THREE.Vector3(0, 0, 0) },
    uDusk: { value: new THREE.Vector3(0, 0, 0) },
    uScroll: { value: 0 },
  };
  private key = '';

  constructor() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.visible = false;
  }

  /** The discs in viewport px (y down): x, y, radius. True if anything changed. */
  set(vw: number, vh: number, night: Disc, day: Disc, dusk: Disc, scroll: number) {
    const key = `${vw}|${vh}|${night.map((v) => v.toFixed(1))}|${day.map((v) => v.toFixed(1))}|${dusk.map((v) => v.toFixed(1))}|${night[2] > 0 || dusk[2] > 0 ? Math.round(scroll) : 0}`;
    if (key === this.key) return false;
    this.key = key;
    this.u.uView.value.set(vw, vh);
    this.u.uNight.value.set(...night);
    this.u.uDay.value.set(...day);
    this.u.uDusk.value.set(...dusk);
    this.u.uScroll.value = scroll;
    // nothing to draw before the night rises, or once the day has covered it again
    const corner = Math.hypot(Math.max(day[0], vw - day[0]), Math.max(day[1], vh - day[1]));
    this.mesh.visible = (night[2] > 0.5 && day[2] < corner) || dusk[2] > 0.5;
    return true;
  }
}
