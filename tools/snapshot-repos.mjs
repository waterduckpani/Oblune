// Snapshots each project's public GitHub repo into src/data/repos/<slug>.json, so the in-site
// code browser opens instantly and never depends on the API's rate limit (60 calls an hour).
// File contents are still fetched live from raw.githubusercontent.com when a file is opened.
//
//   node tools/snapshot-repos.mjs            all repos
//   node tools/snapshot-repos.mjs mull bite  some of them
//
// Set GITHUB_TOKEN to lift the rate limit. Costs 5 API calls per repo.
import { writeFile, mkdir } from 'node:fs/promises';
import { Marked } from 'marked';

const OWNER = 'waterduckpani';
const REPOS = { mull: 'Mull', bite: 'Bite', stocky: 'stocky', article: 'Article', haqdar: 'haqdar', alfard: 'alfard' };
const OUT = new URL('../src/data/repos/', import.meta.url);
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'oblune-snapshot', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
};

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** README markdown to HTML: badges dropped, relative links resolved, links to files opened in the browser. */
function renderReadme(md, name, branch) {
  const raw = (p) => `https://raw.githubusercontent.com/${OWNER}/${name}/${branch}/${p.replace(/^\.?\//, '')}`;
  const blob = (p) => `https://github.com/${OWNER}/${name}/blob/${branch}/${p.replace(/^\.?\//, '')}`;
  const isRel = (u) => u && !/^(https?:|mailto:|#|data:)/.test(u);
  const clean = md
    .split('\n')
    .filter((l) => !/img\.shields\.io/.test(l))
    .join('\n')
    // the Tech stack section is badges only, so it is empty once they are gone
    .replace(/## Tech stack\s*\n\s*\| Layer \| Tools \|\s*\n\|---\|---\|\s*\n(?=\s*(##|<details>))/g, '');
  const marked = new Marked({ gfm: true });
  let html = marked.parse(clean);
  html = html.replace(/(<img[^>]*?\bsrc=")([^"]+)"/g, (m, a, u) => `${a}${isRel(u) ? raw(u) : u}" loading="lazy" decoding="async"`);
  html = html.replace(/<a href="([^"]+)"/g, (m, u) => {
    if (u.startsWith('#')) return m;
    if (isRel(u)) {
      const path = u.replace(/^\.?\//, '').replace(/#.*$/, '');
      return `<a href="${escapeAttr(blob(path))}" data-repo-path="${escapeAttr(path)}"`;
    }
    return `<a href="${escapeAttr(u)}" target="_blank" rel="noopener"`;
  });
  // GitHub alerts
  html = html.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/g, (m, k) => `<blockquote class="alert alert--${k.toLowerCase()}"><p><strong class="alert__k">${k[0] + k.slice(1).toLowerCase()}</strong> `);
  // empty paragraphs left behind by the badge rows, and notes to the author
  html = html.replace(/<div align="center">\s*<\/div>/g, '').replace(/<p>\s*<\/p>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // GitHub-style heading anchors, so the README's own contents links work
  html = html.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (m, n, inner) => {
    const id = inner.replace(/<[^>]+>/g, '').toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `<h${n} id="readme-${id}">${inner}</h${n}>`;
  });
  html = html.replace(/<a href="#([^"]+)"/g, '<a href="#readme-$1" data-readme-anchor');
  return html;
}

async function snapshot(slug) {
  const name = REPOS[slug];
  const repo = await (await api(`/repos/${OWNER}/${name}`)).json();
  const branch = repo.default_branch;
  const [languages, tree, commits, countRes] = await Promise.all([
    api(`/repos/${OWNER}/${name}/languages`).then((r) => r.json()),
    api(`/repos/${OWNER}/${name}/git/trees/${branch}?recursive=1`).then((r) => r.json()),
    api(`/repos/${OWNER}/${name}/commits?per_page=15&sha=${branch}`).then((r) => r.json()),
    api(`/repos/${OWNER}/${name}/commits?per_page=1&sha=${branch}`),
  ]);
  // the last page number of a one-per-page listing is the commit count
  const link = countRes.headers.get('link') ?? '';
  const commitCount = Number(/[?&]page=(\d+)>; rel="last"/.exec(link)?.[1] ?? 1);

  const files = tree.tree
    .filter((e) => !/(^|\/)\.DS_Store$/.test(e.path))
    .slice(0, 5000)
    .map((e) => (e.type === 'tree' ? [e.path, 'd'] : [e.path, 'f', e.size ?? 0]));

  const readmePath = files.find((f) => f[1] === 'f' && /^readme\.md$/i.test(f[0]))?.[0];
  const readmeMd = readmePath ? await (await fetch(`https://raw.githubusercontent.com/${OWNER}/${name}/${branch}/${readmePath}`)).text() : '';

  const total = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  const data = {
    owner: OWNER,
    name,
    branch,
    description: repo.description ?? '',
    homepage: repo.homepage || null,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : 'Source-available',
    pushedAt: repo.pushed_at,
    createdAt: repo.created_at,
    commitCount,
    truncated: !!tree.truncated,
    languages: Object.entries(languages).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10]).filter(([, p]) => p >= 0.1),
    commits: commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      date: c.commit.author?.date ?? c.commit.committer?.date,
    })),
    readmePath: readmePath ?? null,
    readme: readmeMd ? renderReadme(readmeMd, name, branch) : '',
    files,
    snapshotAt: new Date().toISOString(),
  };
  await writeFile(new URL(`${slug}.json`, OUT), JSON.stringify(data));
  console.log(`${slug}: ${files.length} entries, ${commitCount} commits, ${Math.round(JSON.stringify(data).length / 1024)} KB`);
}

await mkdir(OUT, { recursive: true });
const only = process.argv.slice(2);
for (const slug of only.length ? only : Object.keys(REPOS)) await snapshot(slug);
