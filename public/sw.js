const CACHE='unscam-v1';
const ASSETS=['./','./index.html','./style.css','./app.js','./engine.js','./icon.svg','./manifest.webmanifest','./data/scenarios.json','./data/knowledge.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('unscam-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||Response.error())));});
