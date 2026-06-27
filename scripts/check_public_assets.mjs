import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveRouteMeta, resolveRouteStructuredData } from '../src/utils/pageMeta.js';

const root = resolve(import.meta.dirname, '..');
const publicOrigin = 'https://sound-fix-ecfcf.web.app';
const requiredFiles = [
  'index.html',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/site.webmanifest',
  'public/og-image.png',
  'public/favicon.svg',
];

const requiredIndexPatterns = [
  [/<html\s+lang="ja">/, 'html lang ja'],
  [/<link\s+rel="canonical"\s+href="https:\/\/sound-fix-ecfcf\.web\.app\/"/, 'canonical public URL'],
  [/<meta\s+name="description"\s+content="[^"]{30,}"/s, 'description meta'],
  [/<meta\s+property="og:title"\s+content="[^"]*Sound\.back[^"]*"/, 'og:title'],
  [/<meta\s+property="og:description"\s+content="[^"]{30,}"/s, 'og:description'],
  [/<meta\s+property="og:url"\s+content="https:\/\/sound-fix-ecfcf\.web\.app\/"/, 'og:url public URL'],
  [/<meta\s+property="og:image"\s+content="https:\/\/sound-fix-ecfcf\.web\.app\/og-image\.png"/, 'og:image public URL'],
  [/<meta\s+name="twitter:card"\s+content="summary_large_image"/, 'twitter large card'],
  [/<meta\s+name="twitter:title"\s+content="[^"]*Sound\.back[^"]*"/, 'twitter:title'],
  [/<meta\s+name="twitter:description"\s+content="[^"]{30,}"/s, 'twitter:description'],
  [/<script\s+type="application\/ld\+json">/, 'JSON-LD script'],
];

const routeMetaChecks = [
  ['/', 'Sound.back | 音楽制作の悩みを音で相談'],
  ['/about', 'Sound.backとは | 曲の悩みを音で相談'],
  ['/search', '悩みを探す | Sound.back'],
  ['/create', '相談を投稿 | Sound.back'],
  ['/ranking', 'ランキング | Sound.back'],
  ['/post/example', '制作相談 | Sound.back'],
  ['/users/example', 'プロフィール | Sound.back'],
];

const errors = [];

async function readText(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8');
}

async function readBuffer(relativePath) {
  return readFile(resolve(root, relativePath));
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readPngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

for (const file of requiredFiles) {
  try {
    await readBuffer(file);
  } catch {
    errors.push(`missing required file: ${file}`);
  }
}

const indexHtml = await readText('index.html');
for (const [pattern, label] of requiredIndexPatterns) {
  assert(pattern.test(indexHtml), `index.html missing or invalid: ${label}`);
}

const robots = await readText('public/robots.txt');
assert(robots.includes('User-agent: *'), 'robots.txt missing User-agent');
assert(robots.includes(`Sitemap: ${publicOrigin}/sitemap.xml`), 'robots.txt missing public sitemap URL');

const sitemap = await readText('public/sitemap.xml');
assert(sitemap.includes(`<loc>${publicOrigin}/</loc>`), 'sitemap.xml missing home URL');
assert(sitemap.includes(`<loc>${publicOrigin}/about</loc>`), 'sitemap.xml missing /about URL');

const manifest = JSON.parse(await readText('public/site.webmanifest'));
assert(manifest.name === 'Sound.back', 'manifest name must be Sound.back');
assert(manifest.short_name === 'Sound.back', 'manifest short_name must be Sound.back');
assert(manifest.lang === 'ja', 'manifest lang must be ja');
assert(manifest.theme_color === '#0b0f11', 'manifest theme_color must match index theme-color');
assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.src === '/favicon.svg'), 'manifest must include favicon.svg');

const ogImage = await readBuffer('public/og-image.png');
const ogSize = readPngSize(ogImage);
assert(Boolean(ogSize), 'og-image.png must be a PNG file');
assert(ogSize?.width === 1200 && ogSize?.height === 630, `og-image.png must be 1200x630, got ${ogSize?.width ?? '?'}x${ogSize?.height ?? '?'}`);

for (const [path, expectedTitle] of routeMetaChecks) {
  const meta = resolveRouteMeta(path);
  assert(meta.title === expectedTitle, `route meta title mismatch for ${path}`);
  assert(typeof meta.description === 'string' && meta.description.length >= 30, `route meta description too short for ${path}`);
  assert(typeof meta.path === 'string' && meta.path.startsWith('/'), `route meta path invalid for ${path}`);
}

const aboutStructuredData = resolveRouteStructuredData('/about');
assert(aboutStructuredData?.['@type'] === 'FAQPage', '/about structured data must be FAQPage');
assert(Array.isArray(aboutStructuredData?.mainEntity) && aboutStructuredData.mainEntity.length >= 4, '/about FAQPage must include at least 4 questions');
assert(
  aboutStructuredData?.mainEntity?.some((item) => item.name === '無料で使えますか？'),
  '/about FAQPage must include free usage question'
);
assert(resolveRouteStructuredData('/') === null, 'home route should not include route-specific structured data');

if (errors.length > 0) {
  console.error('Public asset check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Public asset check passed.');
