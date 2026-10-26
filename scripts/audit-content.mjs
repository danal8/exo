import {readFile,writeFile} from 'node:fs/promises';
import {parsePage,identityMatches} from './source-parser.mjs';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8'));
const details=JSON.parse(await readFile(new URL('data/details.json',root),'utf8'));
let repaired=0;
const report={checkedAt:new Date().toISOString(),total:catalog.events.length,events:[]};
const cache=new Map();
async function get(url,image=false){
 url=url.replace(/^(https:\/\/(?:www\.)?more\.com|https:\/\/tickets\.public\.gr)\/(theater|music)\//,'$1/gr-el/tickets/$2/');
 if(!cache.has(url))cache.set(url,(async()=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'exo-content-audit/1.0','Accept-Language':'el-GR,el;q=0.9'}});const type=r.headers.get('content-type')||'';if(!r.ok){if(!image&&/^https:\/\/www\.more\.com\/gr-el\/tickets\//.test(url))return get(url.replace('www.more.com','tickets.public.gr'));return {status:r.status,error:'http'};}if(image)return {status:r.status,image:type.startsWith('image/')};return {status:r.status,html:await r.text(),url:r.url}}catch(e){return {error:e.name}}})());
 return cache.get(url);
}
let next=0;
async function worker(){while(next<catalog.events.length){
 const e=catalog.events[next++],d=details[e.id]||{},row={id:e.id,title:e.title,issues:[]};
 // Curated detail content is what the app actually displays.
 const description=d.descriptionSource?.kind==='summary'?d.description:(d.description?.length>(e.description?.length||0)?d.description:e.description);
 if(!description)row.issues.push('missing-summary');
 else if(description.length<100||!/[.!;;]$/.test(description.trim()))row.issues.push('short-or-truncated-summary');
 const poster=d.poster||e.poster;
 if(!poster?.url)row.issues.push('missing-poster');
 else {const r=await get(poster.url,true);row.poster=r;if(r.error||!r.image)row.issues.push('poster-unconfirmed');}
 let ticket=d.ticketUrl||e.ticketUrl;
 if(ticket)ticket=ticket.replace(/^(https:\/\/(?:www\.)?more\.com|https:\/\/tickets\.public\.gr)\/(theater|music)\//,'$1/gr-el/tickets/$2/');
 if(!ticket)row.issues.push('missing-ticket-link');
 else {const r=await get(ticket);row.ticket={url:ticket,status:r.status,error:r.error};
  if(r.html){const p=parsePage(r.html,r.url);row.ticket.title=p.title;row.ticket.blocked=p.blocked;
   if(p.blocked)row.issues.push('ticket-blocked');
   else if(!p.title||/\{\{|�/.test(p.title))row.issues.push('ticket-page-unreadable');
   else if(!identityMatches(e,p))row.issues.push('ticket-identity-review');
  }else row.issues.push('ticket-unconfirmed');
 }
 if(row.issues.some(x=>['missing-summary','short-or-truncated-summary','missing-poster','poster-unconfirmed','missing-ticket-link','ticket-identity-review'].includes(x))){
 const candidates=[...(e.ticketUrl?[{url:e.ticketUrl,kind:'ticket'}]:[]),...(/gazarte/i.test(e.venue)?[{url:'https://tickets.public.gr/gr-el/venues/gazarte/',kind:'ticket'}]:[]),...e.sources.filter(s=>s.kind==='publisher'||s.kind==='official')];
 for(const source of candidates.slice(0,4)){
  const sourcePage=await get(source.url);if(!sourcePage.html)continue;
  const p=parsePage(sourcePage.html,source.url,e.title);if(p.blocked||!identityMatches(e,p))continue;
  if(!p.imageOnly&&row.issues.some(x=>['missing-ticket-link','ticket-identity-review'].includes(x))&&p.ticketUrl){
   const booking=await get(p.ticketUrl);
   if(booking.html){const b=parsePage(booking.html,p.ticketUrl);if(!b.blocked&&identityMatches(e,b)){
    e.ticketUrl=p.ticketUrl;if(details[e.id]?.ticketUrl)details[e.id].ticketUrl=p.ticketUrl;
    row.ticket={url:p.ticketUrl,status:booking.status,title:b.title};row.ticketRepaired=true;repaired++;
    row.issues=row.issues.filter(x=>!['missing-ticket-link','ticket-identity-review'].includes(x));
   }}
  }
  if(!p.imageOnly&&row.issues.some(x=>['missing-summary','short-or-truncated-summary'].includes(x))&&p.description.length>100&&/[.!;;]$/.test(p.description.trim())){
   e.description=p.description;e.descriptionSource={kind:'source-excerpt',authority:source.kind,url:source.url,checkedAt:report.checkedAt};
   if(details[e.id]?.descriptionSource?.kind!=='summary'&&details[e.id]?.description)delete details[e.id].description;
   row.issues=row.issues.filter(x=>!['missing-summary','short-or-truncated-summary'].includes(x));row.summaryRepaired=true;repaired++;
  }
  if(row.issues.some(x=>['missing-poster','poster-unconfirmed'].includes(x))&&p.image){
   const image=await get(p.image,true);if(!image.error&&image.image){e.poster={url:p.image,sourceUrl:source.url,authority:source.kind,kind:'production-photo'};if(details[e.id]?.poster&&details[e.id].poster.url!==p.image)continue;row.issues=row.issues.filter(x=>!['missing-poster','poster-unconfirmed'].includes(x));row.posterRepaired=true;repaired++;}
  }
 }
}
report.events.push(row);
 if(report.events.length%50===0){await writeFile(new URL('data/content-audit.json',root),JSON.stringify(report,null,2));console.log('Audited '+report.events.length+'/'+catalog.events.length);}
}}
await Promise.all(Array.from({length:16},worker));
report.counts={};for(const e of report.events)for(const issue of e.issues)report.counts[issue]=(report.counts[issue]||0)+1;
report.events.sort((a,b)=>a.id.localeCompare(b.id));
await writeFile(new URL('data/content-audit.json',root),JSON.stringify(report,null,2));
await writeFile(new URL('data/catalog.json',root),JSON.stringify(catalog,null,2));
await writeFile(new URL('data/details.json',root),JSON.stringify(details,null,2));
console.log(JSON.stringify({counts:report.counts,repaired}));
