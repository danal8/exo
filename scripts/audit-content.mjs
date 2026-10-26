import {readFile,writeFile} from 'node:fs/promises';
import {parsePage,identityMatches} from './source-parser.mjs';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8'));
const details=JSON.parse(await readFile(new URL('data/details.json',root),'utf8'));
let repaired=0;
const report={checkedAt:new Date().toISOString(),total:catalog.events.length,events:[]};
const cache=new Map();
async function get(url,image=false){
 if(!cache.has(url))cache.set(url,(async()=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'exo-content-audit/1.0','Accept-Language':'el-GR,el;q=0.9'}});const type=r.headers.get('content-type')||'';if(!r.ok)return {status:r.status,error:'http'};if(image)return {status:r.status,image:type.startsWith('image/')};return {status:r.status,html:await r.text(),url:r.url}}catch(e){return {error:e.name}}})());
 return cache.get(url);
}
let next=0;
async function worker(){while(next<catalog.events.length){
 const e=catalog.events[next++],d=details[e.id]||{},row={id:e.id,title:e.title,issues:[]};
 // Curated detail content is what the app actually displays.
 const description=d.descriptionSource?.kind==='summary'?d.description:(d.description?.length>e.description?.length?d.description:e.description);
 if(!description)row.issues.push('missing-summary');
 else if(description.length<100||!/[.!;;]$/.test(description.trim()))row.issues.push('short-or-truncated-summary');
 const poster=d.poster||e.poster;
 if(!poster?.url)row.issues.push('missing-poster');
 else {const r=await get(poster.url,true);row.poster=r;if(r.error||!r.image)row.issues.push('poster-unconfirmed');}
 const ticket=d.ticketUrl||e.ticketUrl;
 if(!ticket)row.issues.push('missing-ticket-link');
 else {const r=await get(ticket);row.ticket={url:ticket,status:r.status,error:r.error};
  if(r.html){const p=parsePage(r.html,r.url);row.ticket.title=p.title;row.ticket.blocked=p.blocked;
   if(p.blocked)row.issues.push('ticket-blocked');
   else if(!identityMatches(e,p))row.issues.push('ticket-identity-review');
  }else row.issues.push('ticket-unconfirmed');
 }
 if(row.issues.some(x=>['missing-summary','short-or-truncated-summary','missing-poster','poster-unconfirmed'].includes(x))){
 for(const source of e.sources.filter(s=>s.kind==='publisher'||s.kind==='official').slice(0,2)){
  const sourcePage=await get(source.url);if(!sourcePage.html)continue;
  const p=parsePage(sourcePage.html,source.url,e.title);if(p.blocked||p.imageOnly||!identityMatches(e,p))continue;
  if(row.issues.some(x=>['missing-summary','short-or-truncated-summary'].includes(x))&&p.description.length>100&&/[.!;;]$/.test(p.description.trim())){
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
