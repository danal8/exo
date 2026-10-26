import {greekWeekly} from './schedule.mjs';
import {normalize,athensDate} from '../core.mjs';
export const decode=s=>String(s??'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
export const text=s=>decode(String(s??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|li|h\d|section)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]));
export function safeUrl(value,base){try{if(!value)return null;const u=new URL(typeof value==='object'?value.url||value['@id']:value,base);return u.protocol==='https:'?u.href:null}catch{return null}}
export function links(html,base){return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>({url:safeUrl(attrs(m[1]).href,base),label:text(m[2])})).filter(x=>x.url)}
const list=x=>x==null?[]:Array.isArray(x)?x:[x];
export function parsePage(html,url){
 const meta={};for(const m of html.matchAll(/<meta\b([^>]+)>/gi)){const a=attrs(m[1]);meta[a.property||a.name]=a.content}
 const nodes=[];function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return}if(v['@type'])nodes.push(v);for(const [k,c]of Object.entries(v))if(k!=='@context')walk(c)}
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(/ld\+json/i.test(m[1]))try{walk(JSON.parse(m[2]))}catch{}
 let events=nodes.filter(n=>list(n['@type']).some(t=>/^(Event|TheaterEvent|MusicEvent|ComedyEvent|Festival)$/.test(t)));
 const main=events[0]||nodes.find(n=>list(n['@type']).some(t=>/^(CreativeWork|Play|Product)$/.test(t)));
 const heading=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
 const title=text(main?.name||heading||meta['og:title']||'').replace(/\s*[|–]\s*(More\.com|Public\.gr).*$/i,'');
 events=events.filter(n=>!n.name||normalize(n.name)===normalize(main?.name||heading));
 const body=text(html);
 const lead=html.split(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)[1]?.split(/<h[23]\b|Πού παίζεται|Αναλυτική κριτική/)[0]||'';
 const paragraph=[...lead.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>text(m[1])).find(t=>t.length>75&&!/cookies|cookie|Ερμηνεύ|Σκηνοθ|Σύνδεση/.test(t));
 const rawDescription=main?.description||paragraph||meta['og:description']||meta.description||'';
 // Short source excerpt; full announcement stays at the original publisher.
 const description=text(rawDescription).split(/\s+/).slice(0,25).join(' ');
 const image=safeUrl(list(main?.image)[0]||meta['og:image'],url);
 const dates=events.map(n=>({raw:n.startDate,end:n.endDate,status:n.eventStatus,url:safeUrl(n.url,url),location:list(n.location)[0]})).filter(x=>/^\d{4}-\d{2}-\d{2}/.test(x.raw||''));
 const ticket=links(html,url).find(l=>/more\.com|tickets\.public\.gr/.test(new URL(l.url).hostname)&&/\/tickets\/|\/theater\/|\/music\//.test(new URL(l.url).pathname));
 const location=list(main?.location)[0];
 const cast=list(main?.performer||main?.actor).map(x=>typeof x==='string'?x:x.name).filter(Boolean);
 const offers=list(main?.offers).filter(o=>o.price!=null).map(o=>String(o.price)+' '+(o.priceCurrency||'EUR'));
 const reviewLinks=links(html,url).filter(l=>/^Διαβάστε ολόκληρη την κριτική$/i.test(l.label.trim())&&new URL(l.url).pathname.split('/').filter(Boolean).length>=4&&/theatre-reviews|kritikh-theatroy|\/reviews\//i.test(l.url));
 const reviews=nodes.filter(n=>list(n['@type']).includes('Review')).map(n=>({author:typeof n.author==='string'?n.author:n.author?.name,url:safeUrl(n.url,url),publishedAt:n.datePublished?.slice(0,10),summary:text(n.description||n.reviewBody||'').split(/\s+/).slice(0,35).join(' '),score:Number(n.reviewRating?.ratingValue),scale:Number(n.reviewRating?.bestRating||5)})).filter(r=>r.author&&r.url&&r.summary&&/theatre-reviews|kritikh-theatroy|\/reviews\//i.test(r.url));
 const scheduleText=body.match(/(?:^|\n)Παραστάσεις\s*\n([^\n]+)/i)?.[1]?.trim();
 const weekly=greekWeekly(scheduleText);
 const castText=body.match(/Ερμηνεύ(?:ουν|ει)\s*:\s*([^\n]+)/i)?.[1];
 if(!cast.length&&castText)cast.push(...castText.split(/Μετάφρ|Μετ\.|Σκην\.|Μουσ\.|Φωτ\.|Εικαστ\.|Ενορχ\.|Κοστ\./)[0].split(',').map(x=>x.trim()).filter(Boolean));
 const audienceBlock=body.match(/(?:Βαθμολογία κοινού|Μέση βαθμολογία θεατών)\s*[:：]?\s*([0-5](?:[.,]\d+)?)\s*\/\s*5\s*\(?\s*(\d+)\s*(?:κριτικ|αξιολογ|ψήφ)/i);
 const audienceRating=audienceBlock?{value:Number(audienceBlock[1].replace(',','.')),scale:5,count:Number(audienceBlock[2])}:null;
 const duration=body.match(/Διάρκεια\s*:\s*(\d+)\s*['’′]/i)?.[1];
 const endMatch=body.match(/(?:Παραστάσεις έως|Εως|Έως)\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
 return {url,title,scheduleText,weekly,audienceRating,description,image,duration:duration?duration+' λεπτά':null,dates,cast,price:offers.join(' · '),location,reviewLinks,reviews,ticketUrl:ticket?.url,
  end:endMatch?endMatch[3]+'-'+endMatch[2]+'-'+endMatch[1]:null,
  blocked:/queue-it\.net|Just a moment|Access Denied|Checking your browser/i.test(html.slice(0,12000)),
  body};
}
export function identityMatches(event,page){const a=normalize(event.title),b=normalize(page.title);return Boolean(a&&b&&(a===b||a.length>6&&b.includes(a)||b.length>6&&a.includes(b)))}
export function futureDates(page,today=athensDate()){
 return page.dates.filter(d=>d.raw.slice(0,10)>=today).map(d=>({date:d.raw.slice(0,10),time:/T\d{2}:\d{2}/.test(d.raw)?d.raw.slice(11,16):null,soldOut:false,status:d.status?.split('/').pop()||'EventScheduled'}));
}
export function enrich(event,page,{now=new Date().toISOString(),kind='publisher'}={}){
 if(page.blocked||!identityMatches(event,page))return {changed:false,reason:page.blocked?'blocked':'identity-mismatch'};
 const today=athensDate(new Date(now)),future=futureDates(page,today),diff=[];
 const ranged=page.dates.find(d=>d.end?.slice(0,10)>=today&&d.raw.slice(0,10)<=d.end.slice(0,10));
 function put(key,value){if(value!=null&&value!==''&&JSON.stringify(event[key])!==JSON.stringify(value)){diff.push(key);event[key]=value}}
 if(event.reviewLinks)event.reviewLinks=event.reviewLinks.filter(r=>new URL(r.url).pathname.split('/').filter(Boolean).length>=4);
 if(page.duration)put('duration',page.duration);
 if(page.weekly){put('weekly',page.weekly);put('scheduleText',page.scheduleText);put('scheduleKnown',true);if(event.dates&&kind==='publisher'&&event.verification?.kind!=='ticket')put('dates',null)}
 const priority={ticket:3,official:2,publisher:1};
 if(page.description.length>=35&&(!event.descriptionSource||priority[kind]>=priority[event.descriptionSource.authority||'publisher'])){put('description',page.description);put('descriptionSource',{url:page.url,kind:'source-excerpt',authority:kind,checkedAt:now})}
 if(page.image&&(!event.poster?.authority||priority[kind]>=priority[event.poster.authority]))put('poster',{url:page.image,sourceUrl:page.url,authority:kind,kind:kind==='ticket'?'poster':'production-photo'});
 if(page.cast.length)put('cast',page.cast);
 if(page.price)put('price',page.price);
 if(page.ticketUrl&&!event.ticketUrl)put('ticketUrl',page.ticketUrl);
 if(page.end&&page.end>=event.start){put('end',page.end);put('endOpen',false)}
 const cancelled=page.dates.length&&page.dates.every(d=>/EventCancelled$/.test(d.status||''));
 if(cancelled)put('programmeStatus','cancelled');
 else if((future.length||ranged&&event.weekly)&&kind!=='publisher'){
  if(ranged&&event.weekly){put('end',ranged.end.slice(0,10));put('endOpen',false)}
  put('programmeStatus',future.length>0&&future.every(d=>d.status==='EventPostponed')?'postponed':'scheduled');
  // Series start/end metadata is not an occurrence list. Keep the sourced weekly timetable.
  const explicit=page.dates.filter(d=>d.raw.slice(0,10)>=today&&(!d.end||d.end.slice(0,10)===d.raw.slice(0,10)));
  if(explicit.length&&!event.weekly){
   const dates=future.filter(d=>explicit.some(x=>x.raw.slice(0,10)===d.date)).map(({status,...d})=>d);
   if(dates.length){put('dates',dates);put('start',dates[0].date);put('end',dates.at(-1).date);put('endOpen',false);put('scheduleKnown',true)}
  }
  put('verification',{state:event.scheduleKnown===false?'pending':'verified',checkedAt:now,url:page.url,kind,evidence:'future-dated-event'});
 }else{
  // Fetching a page or seeing a purchase link does not prove a current programme.
  put('verificationAttempt',{checkedAt:now,url:page.url,result:'no-future-dated-event'});
 }
 const existing=event.sources.find(s=>s.url===page.url);
 if(existing)existing.lastCheckedAt=now;else event.sources.push({name:new URL(page.url).hostname,url:page.url,kind,lastCheckedAt:now});
 if(page.audienceRating?.count>0){
  const rating={...page.audienceRating,source:new URL(page.url).hostname,url:page.url+'#UserRreviews',checkedAt:today,scope:'Η βαθμολογία της πηγής· μπορεί να περιλαμβάνει παλιότερες σεζόν.'};
  event.audienceRatings||=[];const i=event.audienceRatings.findIndex(r=>new URL(r.url).hostname===new URL(page.url).hostname);
  if(i>=0)event.audienceRatings[i]=rating;else event.audienceRatings.push(rating);
 }
 for(const r of page.reviewLinks){event.reviewLinks||=[];if(!event.reviewLinks.some(x=>x.url===r.url))event.reviewLinks.push({url:r.url,label:r.label,checkedAt:now})}
 for(const r of page.reviews){
  if(!event.reviews.some(x=>x.url===r.url))event.reviews.push({id:'source-'+event.id+'-'+event.reviews.length,type:'editorial',source:new URL(r.url).hostname,...r,score:Number.isFinite(r.score)?r.score:null,scale:Number.isFinite(r.score)?r.scale:null});
 }
 return {changed:diff.length>0,fields:diff};
}
