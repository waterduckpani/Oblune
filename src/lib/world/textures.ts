import * as THREE from 'three';

type Entry = { tex: THREE.Texture | null; promise: Promise<THREE.Texture>; refs: number };
const entries = new Map<string, Entry>();
// GPU uploads (with mipmaps) are spread out, one per frame, so a chapter arriving never drops frames
const uploads: (() => void)[] = [];
export function flushUpload() { uploads.shift()?.(); }
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });

/**
 * Loads a screen texture: decoded off the main thread, uploaded to the GPU straight away
 * (so the first frame that shows it does not hitch), and reference counted.
 */
export function acquire(url: string, renderer: THREE.WebGLRenderer): Entry {
  let e = entries.get(url);
  if (!e) {
    const entry: Entry = { tex: null, refs: 0, promise: null as unknown as Promise<THREE.Texture> };
    entry.promise = new Promise((resolve, reject) => {
      loader.load(url, (bitmap) => {
        const t = new THREE.Texture(bitmap as unknown as HTMLImageElement);
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.needsUpdate = true;
        uploads.push(() => { renderer.initTexture(t); entry.tex = t; resolve(t); });
      }, undefined, reject);
    });
    entries.set(url, entry);
    e = entry;
  }
  e.refs++;
  return e;
}

export function release(url: string) {
  const e = entries.get(url);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    e.tex?.dispose();
    ((e.tex?.image as unknown) as ImageBitmap | undefined)?.close?.();
    entries.delete(url);
  }
}
