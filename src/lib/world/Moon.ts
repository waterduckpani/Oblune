import * as THREE from 'three';
import { buildMoon, DOME } from './moonGeometry';
import { litToShader } from '../phase';
import { SDF_GLSL } from './glsl';

/** Fraction of the slot's half-size that the moon's radius fills (the slots are sized around this). */
export const EMBLEM_FILL = 1 / (4.2 * 0.37);

export type MoonState = {
  /** The square slot on the page, CSS px, top-left origin. The moon's radius is EMBLEM_FILL of half its side. */
  rect: { x: number; y: number; w: number };
  /** Illumination, 0 = new, 1 = full; the logo is 0.75. */
  lit: number;
  /** Waning: lit from the other side (the crescent mirrored). It only ever flips at new or full, where the moon is symmetric. */
  wane?: boolean;
  /** Turn about the vertical axis and the horizontal one, radians. */
  tilt: { x: number; y: number };
  /** Where the studio light sits, -1..1. */
  light: { x: number; y: number };
  alpha: number;
  /** The soft shadow it casts on the page by day (0..1). */
  shadow: number;
  /** 0 by day, 1 at night: the shadow becomes a glow. */
  night: number;
  /** Scale of the moon inside its slot (1 = resting). */
  scale: number;
};

const TILT_24 = -24 * (Math.PI / 180);

/**
 * The studio the metal reflects: a dark floor, a pale sky, and a few long softboxes. Chrome is only
 * ever a picture of what is around it, so this is where its look is decided. The lights are long
 * strips, not points, so highlights run along the dome and the bevels instead of sitting as dots.
 */
export function studio(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          // a white sweep: bright above, a soft grey floor below, so chrome reads as silver on a light page
          vec3 floorC = vec3(0.30, 0.305, 0.32);
          vec3 low = vec3(0.62, 0.63, 0.65);
          vec3 high = vec3(0.86, 0.87, 0.89);
          vec3 top = vec3(1.0, 1.0, 1.0);
          vec3 c = mix(floorC, low, smoothstep(-0.6, -0.05, y));
          c = mix(c, high, smoothstep(-0.1, 0.35, y));
          c = mix(c, top, smoothstep(0.3, 0.9, y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  env.add(sky);
  // softboxes: bright in the middle, falling off at the edges, so reflections have soft borders
  const box = (w: number, h: number, pos: [number, number, number], k: number, tint = [1, 1, 1], lean = 0, soft = 0.1) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
        uniforms: { uC: { value: new THREE.Vector3(tint[0] * k, tint[1] * k, tint[2] * k) }, uSoft: { value: new THREE.Vector2(Math.min(0.5, soft / w), Math.min(0.3, 0.1 / h)) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform vec3 uC; uniform vec2 uSoft;
          void main() {
            vec2 e = min(vUv, 1.0 - vUv);
            float a = smoothstep(0.0, uSoft.x, e.x) * smoothstep(0.0, uSoft.y, e.y);
            gl_FragColor = vec4(uC, a);
          }`,
      }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    m.rotateZ(lean);
    env.add(m);
  };
  // The face looks almost straight back at the camera, so it reflects what is just behind it. Nothing
  // is put there: on so smooth a face any panel's edge reflects as a smeared bar or a fan off the
  // crescent's tips. The face reads as satin silver from the sweep alone (and the sweep slides as the
  // pointer turns the studio); the bevels keep the sparkle.
  // an overhead bank lights the tops of the bevels; kickers behind draw the rim
  box(10, 2.6, [0, 9, 3], 2.0);
  box(1.2, 8, [-7, 1, -6], 2.6);
  box(1.2, 8, [7, -1, -6], 2.0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0, 0.1, 100, { size: 1024 }).texture;
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });
  return tex;
}

function metal(face: boolean) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#eceef2'),
    metalness: 1,
    roughness: face ? 0.045 : 0.035,
    envMapIntensity: 1,
    // always blended, so fading it in and out never recompiles the shader
    transparent: true,
  });
  if (face) {
    // the faces are flat geometry shaded as a shallow dome: the reflection slides across them as the moon turns
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vDomeXY; varying vec3 vAx; varying vec3 vAy; varying vec3 vAz;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vDomeXY = position.xy;
          vAx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
          vAy = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
          vAz = normalize(normalMatrix * vec3(0.0, 0.0, sign(normal.z)));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vDomeXY; varying vec3 vAx; varying vec3 vAy; varying vec3 vAz;')
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = normalize(${(2 * DOME).toFixed(4)} * vDomeXY.x * vAx + ${(2 * DOME).toFixed(4)} * vDomeXY.y * vAy + vAz);`);
    };
  }
  return m;
}

/** The moon's soft shadow on the page (by day) or its glow (at night), from the logo's own 2D shape. */
function underMaterial(glow: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: { uA: { value: litToShader(0.75) }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec2 vP;
      uniform float uA;
      uniform float uOpacity;
      ${SDF_GLSL}
      void main() {
        float d = sdEmblem2D(vP, uA);
        ${glow
          ? 'float a = (exp(-max(d, 0.0) * 6.0) * 0.55 + exp(-max(d, 0.0) * 16.0) * 0.45) * smoothstep(1.4, 1.05, length(vP)); gl_FragColor = vec4(vec3(0.87, 0.89, 0.94), a * uOpacity);'
          : 'float a = 1.0 - smoothstep(-0.16, 0.26, d); gl_FragColor = vec4(vec3(0.043, 0.047, 0.063), a * uOpacity);'}
      }`,
  });
}

/**
 * The chrome moon, as an object in the stage's page-space scene (1 unit = 1 CSS px, y up, the page's
 * top at 0). The stage places it at its slot every frame; it shares the stage's studio light and
 * depth, so the ribbon can pass in front of it and behind it.
 */
export class Moon {
  root = new THREE.Group();
  private group = new THREE.Group();
  private spin = new THREE.Group();
  private walls: THREE.Mesh;
  private faces: THREE.Mesh;
  private shadowMesh: THREE.Mesh;
  private glowMesh: THREE.Mesh;
  private under = new THREE.Group();
  private builtLit = -1;
  private lastKey = '';

  constructor() {
    this.walls = new THREE.Mesh(new THREE.BufferGeometry(), metal(false));
    this.faces = new THREE.Mesh(new THREE.BufferGeometry(), metal(true));
    this.spin.add(this.walls, this.faces);
    this.spin.rotation.z = TILT_24;
    this.group.add(this.spin);
    this.root.add(this.group);
    this.walls.renderOrder = this.faces.renderOrder = 2;

    // the shadow lies on the page behind the moon, turned like it, and does not tilt with it
    const plane = new THREE.PlaneGeometry(2.8, 2.8);
    this.shadowMesh = new THREE.Mesh(plane, underMaterial(false));
    this.glowMesh = new THREE.Mesh(plane, underMaterial(true));
    this.shadowMesh.renderOrder = -2;
    this.glowMesh.renderOrder = -1;
    this.under.add(this.shadowMesh, this.glowMesh);
    this.under.rotation.z = TILT_24;
    this.under.position.z = -0.8;
    this.root.add(this.under);
    this.build(0.75);
  }

  private build(lit: number) {
    const { walls, faces } = buildMoon(lit);
    this.walls.geometry.dispose();
    this.faces.geometry.dispose();
    this.walls.geometry = walls;
    this.faces.geometry = faces;
    this.builtLit = lit;
  }

  /** The moon's radius in CSS px for a state. */
  static radius(s: MoonState) { return (s.rect.w / 2) * EMBLEM_FILL * s.scale; }

  /** Places and poses the moon for this frame; returns true if anything about it changed. */
  update(s: MoonState, scrollY: number) {
    const lit = Math.round(Math.min(1, Math.max(0, s.lit)) * 400) / 400;
    if (Math.abs(lit - this.builtLit) > 0.0001) this.build(lit);
    const R = Moon.radius(s);
    this.root.position.set(s.rect.x + s.rect.w / 2, -(s.rect.y + s.rect.w / 2 + scrollY), 0);
    this.root.scale.setScalar(Math.max(0.001, R));
    this.root.visible = s.alpha > 0.002;
    this.group.rotation.set(s.tilt.y, s.tilt.x, 0, 'YXZ');
    const flip = s.wane ? -1 : 1;
    this.walls.scale.x = this.faces.scale.x = this.shadowMesh.scale.x = this.glowMesh.scale.x = flip;
    const day = 1 - s.night;
    const su = (this.shadowMesh.material as THREE.ShaderMaterial).uniforms;
    const gu = (this.glowMesh.material as THREE.ShaderMaterial).uniforms;
    su.uA.value = gu.uA.value = litToShader(lit);
    su.uOpacity.value = 0.17 * s.shadow * day * s.alpha;
    gu.uOpacity.value = 0.3 * s.night * s.alpha;
    this.shadowMesh.visible = su.uOpacity.value > 0.002;
    this.glowMesh.visible = gu.uOpacity.value > 0.002;
    // the shadow falls down and to the right, a little away from the moon
    this.shadowMesh.position.set(0.05, -0.16, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -TILT_24);
    for (const m of [this.walls.material, this.faces.material] as THREE.MeshPhysicalMaterial[]) m.opacity = s.alpha;
    const q = (v: number) => Math.round(v * 2000);
    const key = [lit * 400, flip, q(s.tilt.x), q(s.tilt.y), q(s.alpha), q(s.shadow), q(s.night), Math.round(R * 4),
      Math.round(s.rect.x * 2), Math.round((s.rect.y + scrollY) * 2)].join(',');
    const changed = key !== this.lastKey;
    this.lastKey = key;
    return changed;
  }

  /** Is any of the slot on screen? */
  visible(s: MoonState, vw: number, vh: number) {
    const r = s.rect;
    return s.alpha > 0.002 && r.y < vh && r.y + r.w > 0 && r.x < vw && r.x + r.w > 0;
  }
}
