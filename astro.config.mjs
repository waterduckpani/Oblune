import { defineConfig } from 'astro/config';
import { readdir, rm } from 'node:fs/promises';

// Lab pages and raw stage textures are for rendering stills locally; they never ship.
const stripLab = {
  name: 'oblune:strip-lab',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      for (const p of ['lab', 'lab.html', '_stage']) {
        await rm(new URL(p, dir), { recursive: true, force: true });
      }
      const assets = new URL('_astro/', dir);
      for (const f of await readdir(assets)) {
        if (/^(stage|emblem)[.-]/.test(f)) await rm(new URL(f, assets));
      }
    },
  },
};

export default defineConfig({
  site: 'https://oblunestudio.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
  integrations: [stripLab],
});
