import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parsePage,ticketPoster,identityMatches,links,safeUrl,decode} from './source-parser.mjs';
import {normalize} from '../core.mjs';
const root=new URL('../',import.meta.url),catalog=JSON.parse(await readFile(new URL('data/catalog.json',root))),details=JSON.parse(await readFile(new URL('data/details.json',root)));
const cache=new Map(),report={checkedAt:new Date().toISOString(),checked:0,repaired:[],unresolved:[],failures:[]};
const publicHosts=new Set(['www.more.com','more.com','tickets.public.gr','www.athinorama.gr','www.ticketservices.gr','ticketservices.gr','stream.ticketservices.gr']);
async function get(url,image=false){
 try{if(!publicHosts.has(new URL(url).hostname))return {error:'outside-public-ticket-scope'}}catch{return {error:'invalid-url'}}
 if(!cache.has(url))cache.set(url,(async()=>{try{
  let current=url;
  for(let redirects=0;redirects<4;redirects++){
   if(!publicHosts.has(new URL(current).hostname))throw Error('outside-public-ticket-scope');
   const r=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'Accept-Language':'el-GR,el;q=0.9'}});
   if(r.status>=300&&r.status<400){current=new URL(r.headers.get('location'),current).href;continue;}
   if(!r.ok)throw Error('HTTP '+r.status);
   if(image){if(!r.headers.get('content-type')?.startsWith('image/'))throw Error('not-image');return {ok:true};}
   const charset=r.headers.get('content-type')?.match(/charset=([^; ]+)/i)?.[1]||'utf-8';
   return {html:new TextDecoder(charset).decode(await r.arrayBuffer()),url:current};
  }
  throw Error('too-many-redirects');
 }catch(e){return {error:e.message}}})());return cache.get(url);
}
function readable(url){const u=new URL(url);if(/more\.com|tickets\.public\.gr/.test(u.hostname)){u.search='';u.pathname=u.pathname.replace(/^\/gr-[^/]+\/tickets\//,'/gr-el/').replace(/^\/(music|theater)\//,'/gr-el/$1/');}return u.href}
const hubs=['https://www.more.com/gr-el/venues/stayros/','https://tickets.public.gr/gr-el/venues/ilion-plus/','https://tickets.public.gr/gr-el/venues/gazarte/','https://www.more.com/gr-el/tickets/music/'];
const ticketIndexUrl='https://www.ticketservices.gr/el/ticketspublic/';
const ticketIndex=await get(ticketIndexUrl);
const ticketLinks=ticketIndex.html?links(ticketIndex.html,ticketIndexUrl).filter(l=>l.url.includes('/event/')):[];
let cursor=0;const events=catalog.events.filter(e=>e.category==='concert');
await Promise.all(Array.from({length:8},async()=>{while(cursor<events.length){const e=events[cursor++];report.checked++;const old=details[e.id]?.poster||e.poster;if(old?.url&&(await get(old.url,true)).ok)continue;
 const matchingTickets=[...new Set(ticketLinks.filter(l=>normalize(e.title).length>=5&&normalize(l.label).includes(normalize(e.title))).map(l=>l.url))];
 const urls=[...(matchingTickets.length===1?matchingTickets:[]),...(e.ticketUrl?[readable(e.ticketUrl)]:[]),...e.sources.map(s=>s.url),...hubs];let fixed=false;
 for(const url of [...new Set(urls)]){const r=await get(url);if(!r.html)continue;const p=parsePage(r.html,url,e.title);if(p.blocked)continue;
 const ticketServiceImage=/^(?:www\.)?ticketservices\.gr$/.test(new URL(url).hostname)?safeUrl(decode(r.html.match(/<img[^>]+src=["']([^"']*pictures\/(?:original|main)\/[^"']+)["']/i)?.[1]||''),url):null;
 const image=ticketPoster(r.html,url,e.title)||(identityMatches(e,p)&&!p.imageOnly?p.image||ticketServiceImage:null);
 if(!image||!(await get(image,true)).ok)continue;
 e.poster={url:image,sourceUrl:url,authority:/more\.com|tickets\.public\.gr/.test(url)?'ticket':'publisher',kind:'poster',checkedAt:report.checkedAt};
 if(details[e.id]?.poster)details[e.id].poster=e.poster;
 if(url===matchingTickets[0]&&matchingTickets.length===1){e.ticketUrl=url;if(details[e.id])details[e.id].ticketUrl=url;}
 report.repaired.push({id:e.id,title:e.title,url:image,sourceUrl:url});fixed=true;break;
 }
 if(!fixed)report.unresolved.push({id:e.id,title:e.title});
 if(report.checked%25===0)console.log('Posters checked',report.checked,'repaired',report.repaired.length);
}}));
await writeFile(new URL('data/catalog.json',root),JSON.stringify(catalog,null,2)+'\n');await writeFile(new URL('data/details.json',root),JSON.stringify(details,null,2)+'\n');await writeFile(new URL('data/poster-report.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checked:report.checked,repaired:report.repaired.length,unresolved:report.unresolved.length}));
