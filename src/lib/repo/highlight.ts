import { createHighlighterCore, type HighlighterCore, type ThemeRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * Syntax highlighting for the code browser. Shiki with the JavaScript regex engine (no wasm), and a
 * theme cut from the site's own palette: graphite ground, steel text, a little warmth in the strings.
 * Grammars load one at a time, the first time a file of that language is opened.
 */
const theme: ThemeRegistration = {
  name: 'oblune',
  type: 'dark',
  colors: { 'editor.background': '#0e0e10', 'editor.foreground': '#d6d7db' },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment', 'string.comment'], settings: { foreground: '#666870', fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted', 'string.template', 'string.regexp', 'markup.inline.raw'], settings: { foreground: '#d9c7a0' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant', 'constant.other'], settings: { foreground: '#a9c6e3' } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.new', 'keyword.operator.expression', 'variable.language'], settings: { foreground: '#e6a79e' } },
    { scope: ['keyword.operator', 'punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator'], settings: { foreground: '#8a8c93' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function', 'variable.function'], settings: { foreground: '#f3f3f5' } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'entity.other.inherited-class', 'storage.type.class'], settings: { foreground: '#b9d3ae' } },
    { scope: ['variable.parameter', 'meta.parameter'], settings: { foreground: '#e3cdaa' } },
    { scope: ['variable.other.property', 'meta.object-literal.key', 'support.type.property-name', 'entity.name.tag.yaml'], settings: { foreground: '#c3c9d6' } },
    { scope: ['entity.name.tag', 'punctuation.definition.tag'], settings: { foreground: '#e6a79e' } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: '#d9c7a0' } },
    { scope: ['markup.heading', 'entity.name.section'], settings: { foreground: '#f3f3f5', fontStyle: 'bold' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.underline.link', 'string.other.link'], settings: { foreground: '#a9c6e3' } },
    { scope: ['markup.inserted'], settings: { foreground: '#b9d3ae' } },
    { scope: ['markup.deleted'], settings: { foreground: '#e6a79e' } },
    { scope: ['entity.name.decorator', 'meta.decorator', 'meta.annotation'], settings: { foreground: '#c9b3e0' } },
  ],
};

const LANGS: Record<string, () => Promise<unknown>> = {
  dart: () => import('@shikijs/langs/dart'),
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  python: () => import('@shikijs/langs/python'),
  sql: () => import('@shikijs/langs/sql'),
  json: () => import('@shikijs/langs/json'),
  yaml: () => import('@shikijs/langs/yaml'),
  markdown: () => import('@shikijs/langs/markdown'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  toml: () => import('@shikijs/langs/toml'),
  swift: () => import('@shikijs/langs/swift'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  xml: () => import('@shikijs/langs/xml'),
  ini: () => import('@shikijs/langs/ini'),
  dotenv: () => import('@shikijs/langs/dotenv'),
  docker: () => import('@shikijs/langs/docker'),
  groovy: () => import('@shikijs/langs/groovy'),
};

const EXT: Record<string, string> = {
  dart: 'dart', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'jsx', py: 'python', sql: 'sql', json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', mdx: 'markdown',
  css: 'css', html: 'html', htm: 'html', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', toml: 'toml', swift: 'swift',
  kt: 'kotlin', kts: 'kotlin', xml: 'xml', plist: 'xml', xcscheme: 'xml', storyboard: 'xml', ini: 'ini', cfg: 'ini', gradle: 'groovy',
};

/** The grammar for a path, or null for plain text. */
export function langOf(path: string): string | null {
  const base = path.split('/').pop()!.toLowerCase();
  if (base === 'dockerfile') return 'docker';
  if (base.startsWith('.env')) return 'dotenv';
  if (base === '.gitignore' || base === 'podfile' || base === 'gemfile') return null;
  const ext = base.includes('.') ? base.split('.').pop()! : '';
  return EXT[ext] ?? null;
}

let core: Promise<HighlighterCore> | null = null;
const getCore = () => (core ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) }));

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Code as HTML: one `.line` span per line, highlighted when the language is known and the file is small enough. */
export async function highlight(code: string, lang: string | null): Promise<string> {
  const plain = () => `<pre class="shiki"><code>${code.split('\n').map((l) => `<span class="line">${escape(l)}</span>`).join('\n')}</code></pre>`;
  if (!lang || !LANGS[lang] || code.length > 160_000) return plain();
  try {
    const h = await getCore();
    if (!h.getLoadedLanguages().includes(lang)) {
      const mod = (await LANGS[lang]()) as { default: Parameters<HighlighterCore['loadLanguage']>[0] };
      await h.loadLanguage(mod.default);
    }
    return h.codeToHtml(code, { lang, theme: 'oblune' });
  } catch {
    return plain();
  }
}
