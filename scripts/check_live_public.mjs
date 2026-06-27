const PUBLIC_APP_ORIGIN = 'https://sound-fix-ecfcf.web.app';

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function contentType(response) {
  return response.headers.get('content-type') || '';
}

function readPngSize(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = Array.from(bytes.subarray(0, 8))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (signature !== '89504e470d0a1a0a') return null;

  const view = new DataView(buffer);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

async function fetchText(path) {
  const response = await fetch(`${PUBLIC_APP_ORIGIN}${path}`, {
    headers: {
      'cache-control': 'no-cache',
    },
  });
  const text = await response.text();
  return { response, text };
}

async function fetchBuffer(path) {
  const response = await fetch(`${PUBLIC_APP_ORIGIN}${path}`, {
    headers: {
      'cache-control': 'no-cache',
    },
  });
  const buffer = await response.arrayBuffer();
  return { response, buffer };
}

function assertAppShell(route, result) {
  assert(result.response.ok, `${route} must return 2xx`);
  assert(contentType(result.response).includes('text/html'), `${route} content-type must be text/html, got ${contentType(result.response)}`);
  assert(result.text.includes('<html lang="ja">'), `${route} must use lang="ja"`);
  assert(result.text.includes('<title>Sound.back | 音楽制作の悩みを音で相談</title>'), `${route} must serve current Sound.back app shell`);
}

const home = await fetchText('/');
assertAppShell('/', home);
assert(home.text.includes('https://sound-fix-ecfcf.web.app/og-image.png'), '/ must include public og-image URL');

const appShellRoutes = [
  '/about',
  '/search?source=about',
  '/create',
  '/post/__smoke__',
  '/users/__smoke__',
];

for (const route of appShellRoutes) {
  assertAppShell(route, await fetchText(route));
}

const robots = await fetchText('/robots.txt');
assert(robots.response.ok, '/robots.txt must return 2xx');
assert(contentType(robots.response).includes('text/plain'), `/robots.txt content-type must be text/plain, got ${contentType(robots.response)}`);
assert(robots.text.includes(`Sitemap: ${PUBLIC_APP_ORIGIN}/sitemap.xml`), '/robots.txt must include sitemap URL');

const sitemap = await fetchText('/sitemap.xml');
assert(sitemap.response.ok, '/sitemap.xml must return 2xx');
assert(contentType(sitemap.response).includes('xml'), `/sitemap.xml content-type must be XML, got ${contentType(sitemap.response)}`);
assert(sitemap.text.includes(`<loc>${PUBLIC_APP_ORIGIN}/</loc>`), '/sitemap.xml must include home URL');
assert(sitemap.text.includes(`<loc>${PUBLIC_APP_ORIGIN}/about</loc>`), '/sitemap.xml must include /about URL');

const manifest = await fetchText('/site.webmanifest');
assert(manifest.response.ok, '/site.webmanifest must return 2xx');
assert(contentType(manifest.response).includes('json') || contentType(manifest.response).includes('manifest'), `/site.webmanifest content-type must be JSON/manifest, got ${contentType(manifest.response)}`);
try {
  const parsedManifest = JSON.parse(manifest.text);
  assert(parsedManifest.name === 'Sound.back', '/site.webmanifest name must be Sound.back');
} catch {
  errors.push('/site.webmanifest must be valid JSON');
}

const ogImage = await fetchBuffer('/og-image.png');
assert(ogImage.response.ok, '/og-image.png must return 2xx');
assert(contentType(ogImage.response).includes('image/png'), `/og-image.png content-type must be image/png, got ${contentType(ogImage.response)}`);
const ogSize = readPngSize(ogImage.buffer);
assert(Boolean(ogSize), '/og-image.png must be a PNG file');
assert(ogSize?.width === 1200 && ogSize?.height === 630, `/og-image.png must be 1200x630, got ${ogSize?.width ?? '?'}x${ogSize?.height ?? '?'}`);

if (errors.length > 0) {
  console.error('Live public check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Live public check passed.');
