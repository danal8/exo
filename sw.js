const CACHE='exo-public-shell-v1';
const base=new URL('./',self.location.href);
const assets=['','index.html','manifest.webmanifest','icons/favicon.svg','icons/favicon-32.png','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(assets.map(p=>new URL(p,base).href))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('exo-public-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Never store authentication, account requests, ticket records or catalogue responses.
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 const path=url.pathname.slice(base.pathname.length);
 const isStatic=assets.includes(path)||['app.js','core.mjs','account.js','pwa.js','vendor/supabase-2.118.0.js'].includes(path);
 if(!isStatic||request.mode==='navigate'&&url.search)return;
 event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response}).catch(async()=>{const cached=await caches.match(request);return cached||Response.error()}));
});
