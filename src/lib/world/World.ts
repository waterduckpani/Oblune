import * as THREE from 'three';
import { ENV_GLSL } from './glsl';
import { EmblemLayer, type EmblemState } from './EmblemLayer';
import { ChapterStage } from './chapters';
import { flushUpload } from './textures';

export type FrameHook = (t: number, dt: number) => void;

/** A few hundred faint stars, only at night. Screen space, so they hang still while the page moves. */
class Stars {
  mesh: THREE.Points;
  material: THREE.ShaderMaterial;
  constructor(count = 240) {
    const pos = new Float32Array(count * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd();
      pos[i * 3 + 1] = rnd();
      pos[i * 3 + 2] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uDpr: { value: 1 }, uDrift: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uDpr; uniform float uDrift;
        varying float vA;
        void main() {
          vec2 p = position.xy;
          p.y = fract(p.y - uDrift * (0.3 + position.z * 0.7));
          vA = (0.35 + 0.65 * position.z) * (0.55 + 0.45 * sin(uTime * (0.6 + position.z * 1.7) + position.x * 40.0));
          gl_PointSize = (0.8 + position.z * 1.6) * uDpr;
          gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.92, 0.93, 0.96), smoothstep(0.5, 0.15, d) * vA * uAlpha);
        }`,
    });
    this.mesh = new THREE.Points(g, this.material);
    this.mesh.frustumCulled = false;
  }
}

/**
 * One persistent WebGL world behind the page. A perspective camera is set so that one world
 * unit equals one CSS pixel at z = 0, which lets 3D objects lock onto DOM layout exactly.
 * Draw order: devices, then the page-space overlays behind the moon (the orbit line, stars),
 * then the moon, then overlays in front of it.
 */
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);
  emblem: EmblemLayer;
  emblemState: EmblemState = {
    rect: { x: 0, y: 0, w: 10 },
    phase: 12 / 35,
    tilt: { x: 0, y: 0 },
    light: { x: 0, y: 0 },
    alpha: 0,
    shadow: 1,
    night: 0,
    drops: [],
    body: 1,
  };
  back = new THREE.Scene();
  front = new THREE.Scene();
  stars = new Stars();
  chapters: ChapterStage[] = [];
  /** Stages kept by project, so coming back home reuses their compiled shaders. */
  private stages = new Map<string, ChapterStage>();
  /** Device pixel ratio ceiling; lowered a step if frames run long (see `frame`). */
  private dprCap = 2;
  private slow = 0;
  private settled = 0;
  vw = innerWidth;
  vh = innerHeight;
  dpr = 1;
  pointer = { x: 0, y: 0, px: -1, py: -1 };
  time = 0;
  hooks: FrameHook[] = [];
  readonly coarse = matchMedia('(pointer: coarse)').matches;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.emblem = new EmblemLayer(this.coarse ? 80 : 110);
    this.back.add(this.stars.mesh);
    this.buildEnvironment();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      this.pointer.px = e.clientX;
      this.pointer.py = e.clientY;
      this.pointer.x = (e.clientX / this.vw) * 2 - 1;
      this.pointer.y = (e.clientY / this.vh) * 2 - 1;
    }, { passive: true });
  }

  private buildEnvironment() {
    const env = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir;\n${ENV_GLSL}\nvoid main(){ gl_FragColor = vec4(studioEnv(normalize(vDir), vec2(0.0)), 1.0); }`,
    });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.012).texture;
    pmrem.dispose();
  }

  resize() {
    this.vw = innerWidth;
    this.vh = innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.vw, this.vh, false);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = this.vh / 2 / Math.tan(fov / 2);
    this.camera.aspect = this.vw / this.vh;
    this.camera.position.set(0, 0, dist);
    this.camera.near = dist * 0.1;
    this.camera.far = dist * 3;
    this.camera.updateProjectionMatrix();
  }

  /** Point the stages at this page's chapters (made once, then reused on every return home). */
  bindChapters(sections: HTMLElement[]) {
    this.chapters = sections.map((s) => {
      const slug = s.dataset.chapter!;
      let c = this.stages.get(slug);
      if (c) c.bind(s);
      else { c = new ChapterStage(this, s, slug); this.stages.set(slug, c); }
      return c;
    });
  }
  /** Leaving home: the stages let go of their screens until they are needed again. */
  releaseChapters() {
    this.chapters.forEach((c) => { c.unload(); c.root.visible = false; });
    this.chapters = [];
    this.renderer.clear();
  }

  /** The hero needs only the moon; the devices and overlays compile in the background, long before they appear. */
  async warm() {
    const moon = this.renderer.compileAsync(this.emblem.scene, this.emblem.camera);
    this.devicesReady = Promise.all([
      ...this.chapters.map((c) => this.renderer.compileAsync(c.scene, this.camera)),
      this.renderer.compileAsync(this.back, this.emblem.camera),
      this.renderer.compileAsync(this.front, this.emblem.camera),
    ]);
    await moon;
  }
  devicesReady: Promise<unknown> = Promise.resolve();

  frame(dt: number) {
    this.time += dt;
    // if frames keep running long, draw at a lower resolution: smoothness matters more than pixels
    if (this.dprCap > 1.25 && this.time > 3) {
      this.slow = dt > 0.021 ? this.slow + 1 : Math.max(0, this.slow - 0.5);
      if (++this.settled > 90 && this.slow > 30) {
        this.dprCap = this.dprCap > 1.6 ? 1.5 : 1.25;
        this.slow = 0; this.settled = 0;
        this.resize();
      }
    }
    flushUpload();
    for (const h of this.hooks) h(this.time, dt);
    let draw = false;
    for (const c of this.chapters) draw = c.update(this.time, dt, this.pointer) || draw;
    const es = this.emblemState;
    const emblemOn = es.alpha > 0.002 && es.rect.y < this.vh && es.rect.y + es.rect.w > 0 && es.rect.x < this.vw && es.rect.x + es.rect.w > 0;
    const su = this.stars.material.uniforms;
    su.uTime.value = this.time;
    su.uDpr.value = this.dpr;
    this.stars.mesh.visible = su.uAlpha.value > 0.002;

    this.renderer.clear();
    if (draw) {
      // each stage is clipped to its own panel, so devices never cross into the text
      this.renderer.setScissorTest(true);
      for (const c of this.chapters) {
        if (!c.active) continue;
        const { x, y, w, h } = c.clip;
        this.renderer.setScissor(x, this.vh - y - h, w, h);
        this.renderer.render(c.scene, this.camera);
      }
      this.renderer.setScissorTest(false);
    }
    this.renderer.render(this.back, this.emblem.camera);
    if (emblemOn) {
      this.emblem.apply(es, this.vw, this.vh, this.dpr, this.time);
      this.renderer.render(this.emblem.scene, this.emblem.camera);
    }
    this.renderer.render(this.front, this.emblem.camera);
  }
}
