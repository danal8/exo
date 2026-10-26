import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parsePage,links,enrich,safeUrl,identityMatches,futureDates} from './source-parser.mjs';
import {athensDate,normalize} from '../core.mjs';
const root=new URL('../',import.meta.url),now=new Date().toISOString(),today=athensDate();
const catalog=JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8'));
const report={startedAt:now,checked:0,enriched:0,verified:0,added:0,failures:[],changes:[],candidates:[],discovery:[]};
const cache=new Map(),hostNext=new Map(),hostErrors=new Map();let requests=0;
const budget=Number(process.env.EXO_PAGE_BUDGET||1800);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const allowed=new Set(['www.more.com','tickets.public.gr','www.athinorama.gr',...catalog.events.flatMap(e=>e.sources.filter(s=>s.kind==='official').map(s=>new URL(s.url).hostname))]);
async function request(url){
 url=safeUrl(url);if(!url||!allowed.has(new URL(url).hostname))throw Error('unsupported-host');
 if(cache.has(url))return cache.get(url);
 const task=(async()=>{
  if((hostErrors.get(new URL(url).hostname)||0)>=6)throw Error('source-temporarily-unavailable');
  if(++requests>budget)throw Error('page-budget');
  const host=new URL(url).hostname,delay=Math.max(0,(hostNext.get(host)||0)-Date.now());hostNext.set(host,Date.now()+delay+450);await wait(delay);
  const response=await fetch(url,{headers:{'User-Agent':'exo-catalog/1.0 (+https://github.com/danal8/exo)','Accept-Language':'el-GR,el;q=0.9'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(!allowed.has(new URL(response.url).hostname))throw Error('redirect-to-protection');
  hostErrors.set(host,0);
  const html=await response.text();if(html.length>8000000)throw Error('page-too-large');
  const page=parsePage(html,url);if(page.blocked)throw Error('access-protection');return {html,page};
 })().catch(error=>{const host=new URL(url).hostname;hostErrors.set(host,(hostErrors.get(host)||0)+1);throw error});cache.set(url,task);return task;
}
const kindOf=url=>/more\.com|tickets\.public\.gr/.test(new URL(url).hostname)?'ticket':new URL(url).hostname==='www.athinorama.gr'?'publisher':'official';
const sourceUrls=e=>[...new Set([e.ticketUrl,...e.sources.map(s=>s.url)].filter(Boolean))];
const alternate=url=>{try{const u=new URL(url);if(u.hostname==='www.more.com'&&u.pathname.includes('/tickets/')){u.hostname='tickets.public.gr';return u.href}if(u.hostname==='tickets.public.gr'){u.hostname='www.more.com';return u.href}}catch{}};
async function update(event){
 const before=JSON.stringify(event),urls=sourceUrls(event);
 for(const u of [...new Set([...urls,...urls.map(alternate).filter(Boolean)])]){
  try{
   const {page}=await request(u);report.checked++;
   const result=enrich(event,page,{now,kind:kindOf(u)});
   if(result.reason)report.failures.push({id:event.id,url:u,reason:result.reason});
  }catch(error){report.failures.push({id:event.id,url:u,reason:error.message})}
 }
 if(JSON.stringify(event)!==before){report.enriched++;report.changes.push({id:event.id,title:event.title})}
 if(report.changes.length%25===0)console.log('Progress',report.checked,'source pages;',report.enriched,'updated productions');
 if(event.verification?.checkedAt===now&&event.verification.state==='verified')report.verified++;
}
async function pool(items,fn){let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<items.length)await fn(items[cursor++])}))}
const seeds=['https://www.athinorama.gr/theatre/guide/all/','https://www.athinorama.gr/music/guide/','https://www.more.com/gr-el/tickets/theater/','https://www.more.com/gr-el/tickets/music/','https://tickets.public.gr/gr-el/tickets/theater/','https://tickets.public.gr/gr-el/tickets/music/','https://www.fuzzclub.gr/events/','https://www.floyd.gr/events/','https://www.gazarte.gr/events/','https://barakididotou.gr/events/'];
const discovered=new Map();
for(const seed of seeds){
 try{
  const {html}=await request(seed);
  const found=links(html,seed).filter(l=>/\/theatre\/performance\/|\/music\/(?:concert|gig|event)\/|\/tickets\/(?:theater|music)\/[^/?]+|\/event\/[^/?]+/.test(new URL(l.url).pathname));
  report.discovery.push({url:seed,checkedAt:now,links:found.length,status:'ok'});found.forEach(l=>discovered.set(l.url,l));
 }catch(error){report.discovery.push({url:seed,status:'failed',reason:error.message})}
}
await pool(catalog.events,update);
const known=new Set(catalog.events.flatMap(sourceUrls));
await pool([...discovered.values()].filter(l=>!known.has(l.url)),async l=>{
 try{
  const {page}=await request(l.url);
  if(catalog.events.some(e=>identityMatches(e,page))){report.candidates.push({url:l.url,title:page.title,reason:'existing-title-requires-production-match'});return}
  const dates=futureDates(page,today).filter(d=>d.status==='EventScheduled'),loc=page.location;
  const address=typeof loc?.address==='string'?loc.address:loc?.address?.streetAddress;
  const city=normalize(typeof loc?.address==='object'?loc.address.addressLocality:'');
  const localVenue=catalog.events.find(e=>normalize(e.venue)===normalize(loc?.name));
  const inAthens=localVenue||/αθην|athens|πειραι|piraeus|ταυρο|tavros|μοσχατ|moschato|μαρουσ|marous/.test(city);
  if(!page.title||!loc?.name||!dates.length||!inAthens){report.candidates.push({url:l.url,title:page.title,reason:'needs-location-or-future-dates'});return}
  const id='auto-'+createHash('sha256').update(l.url).digest('hex').slice(0,14);
  const event={id,title:page.title,category:/theater|theatre/.test(l.url)?'theatre':'concert',genre:/theater|theatre/.test(l.url)?'Θέατρο':'Live μουσική',venue:loc.name,area:localVenue?.area||loc.address?.addressLocality||'Αθήνα',address:address||'',cast:[],description:'',start:dates[0].date,end:dates.at(-1).date,dates:dates.map(({status,...d})=>d),sources:[],reviews:[],ticketUrl:kindOf(l.url)==='ticket'?l.url:page.ticketUrl,season:today.slice(0,4)+'–'+(+today.slice(0,4)+1)};
  enrich(event,page,{now,kind:kindOf(l.url)});catalog.events.push(event);known.add(l.url);report.added++;
 }catch(error){report.failures.push({url:l.url,reason:error.message})}
});
report.coverage={total:catalog.events.length,descriptions:catalog.events.filter(e=>e.description).length,posters:catalog.events.filter(e=>e.poster?.url).length,editorial:catalog.events.filter(e=>e.reviews.length||e.editorialRatings?.length||e.reviewLinks?.length).length,audience:catalog.events.filter(e=>e.audienceRatings?.length).length,verifiedThisRun:report.verified};
report.finishedAt=new Date().toISOString();catalog.refresh={checkedAt:now,reportUrl:'./data/refresh-report.json',...report.coverage};
await writeFile(new URL('data/catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
await writeFile(new URL('data/refresh-report.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checked:report.checked,enriched:report.enriched,added:report.added,failures:report.failures.length,coverage:report.coverage}));
if(report.checked===0)process.exitCode=1;
