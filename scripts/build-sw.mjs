import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = await readdir('dist/assets');
const staticFiles = ['index.html', 'brand/icon.jpg', 'privacy.html', 'terms.html', 'googlef53875cf353db667.html'];
const hash = createHash('sha256').update(assets.join(','));
for (const file of staticFiles) {
  hash.update(await readFile(`dist/${file}`));
}
const version = hash.digest('hex').slice(0, 12);
const shell = ['./', ...staticFiles.map((name) => `./${name}`), ...assets.map((name) => `./assets/${name}`)];
await writeFile(
  'dist/sw.js',
  `
const CACHE = 'readfold-${version}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('readfold-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || !url.pathname.startsWith(new URL('./', self.location).pathname)) { return; }
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (request.mode === 'navigate') {
      const fallback = async () => await cache.match(request, { ignoreVary: true })
        ?? await cache.match('./index.html', { ignoreVary: true });
      try { const response = await fetch(request); return response.ok ? response : await fallback() ?? response; }
      catch { return await fallback(); }
    }
    const cached = await cache.match(request, { ignoreVary: true });
    if (!url.pathname.includes('/books/') && cached) { return cached; }
    let response;
    try { response = await fetch(request); }
    catch (error) { if (cached) { return cached; } throw error; }
    if (response.ok) { await cache.put(request, response.clone()); }
    return response;
  }));
});
`,
);
