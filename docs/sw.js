
const CACHE = 'readfold-3820f9a72d30';
const SHELL = ["./","./index.html","./brand/icon.jpg","./brand/favicon.svg","./privacy.html","./terms.html","./googlef53875cf353db667.html","./assets/index-Ciiy5qwC.js","./assets/index-DC3lcoss.css","./assets/language-BwSMSIVv.js","./assets/local-jLDYjhZK.js","./assets/react-C4F3-wyL.js","./assets/supabase-CelhU-Wa.js","./assets/validation-D1g8DkzT.js"];
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
    if (!url.pathname.includes('/books/') && !url.pathname.includes('/ja/') && cached) { return cached; }
    let response;
    try { response = await fetch(request); }
    catch (error) { if (cached) { return cached; } throw error; }
    if (response.ok) { await cache.put(request, response.clone()); }
    return response;
  }));
});
