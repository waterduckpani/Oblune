// Project covers: each one is rendered by the lab stage (src/pages/lab/stage.astro) and saved at
// three widths, plus the share image.
//
//   node tools/covers.mjs capture http://localhost:4321 [slug ...]   render, then write every size
//   node tools/covers.mjs from <dir> [slug ...]                        write every size from <dir>/<slug>.png (2400 x 1500)
//   node tools/covers.mjs sizes [slug ...]                             only rewrite the sizes from the 2400 masters
//   node tools/covers.mjs menu http://localhost:4321 [slug ...]       the menu's 800 px cards, camera pulled back per PULL
//
// Capture needs the dev server (the lab page is not built) and playwright-core with Chrome.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/work/`;
// how far the menu card's camera backs off, so no device is cut by the small frame
const PULL = { mull: 1.8, article: 1.45, 'power-policy': 1.35 };
const ALL = ['mull', 'bite', 'alfard', 'haqdar', 'article', 'power-policy', 'stocky', 'viraj-mahajan'];

async function sizes(slug, master) {
  const src = master ?? `${OUT}${slug}-2400.webp`;
  const img = sharp(src);
  if (master) await sharp(master).webp({ quality: 88, effort: 6 }).toFile(`${OUT}${slug}-2400.webp`);
  await img.clone().resize(1400).webp({ quality: 84, effort: 6 }).toFile(`${OUT}${slug}-1400.webp`);
  await img.clone().resize(800).webp({ quality: 80, effort: 6 }).toFile(`${OUT}${slug}-800.webp`);
  // the share card: 1200 x 630, the cover centred on its own colour
  await img.clone().resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84, mozjpeg: true }).toFile(`${OUT}share/${slug}.jpg`);
}

async function capture(base, slugs, menu = false) {
  const { chromium } = await import('playwright-core');
  const b = await chromium.launch({ channel: 'chrome' });
  const page = await b.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 2 });
  for (const slug of slugs) {
    await page.goto(`${base}/lab/stage?p=${slug}&bg=1&pull=${menu ? PULL[slug] ?? 1 : 1}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const png = `${ROOT}node_modules/.cache-cover-${slug}.png`;
    await page.screenshot({ path: png });
    if (menu) await sharp(png).resize(800).webp({ quality: 80, effort: 6 }).toFile(`${OUT}${slug}-menu.webp`);
    else await sizes(slug, png);
    console.log('captured', slug);
  }
  await b.close();
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'capture') {
  const [base, ...slugs] = rest;
  await capture(base, slugs.length ? slugs : ALL);
} else if (mode === 'menu') {
  const [base, ...slugs] = rest;
  await capture(base, slugs.length ? slugs : ALL, true);
} else if (mode === 'from') {
  const [dir, ...slugs] = rest;
  for (const s of slugs.length ? slugs : ALL) { await sizes(s, `${dir}/${s}.png`); console.log('sized', s); }
} else if (mode === 'sizes') {
  for (const s of rest.length ? rest : ALL) { await sizes(s); console.log('sized', s); }
} else {
  console.log('usage: node tools/covers.mjs capture <dev-server-url> [slug ...] | sizes [slug ...]');
}
