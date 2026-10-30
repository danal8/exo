import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseCriticsIndex,parseReviewArticle,matchReview,reviewKey} from './reviews.mjs';
import {links} from './source-parser.mjs';import {athensDate} from '../core.mjs';
const root=new URL('../',import.meta.url),catalog=JSON.parse(await readFile(new URL('data/catalog.json',root))),details=JSON.parse(await readFile(new URL('data/details.json',root)));
let data;try{data=JSON.parse(await readFile(new URL('data/reviews.json',root)))}catch{data={events:{}}}
for(const [id,reviews]of Object.entries(data.events)){const unique=new Map();for(const r of reviews){const key=reviewKey(r);if(!unique.has(key))unique.set(key,r)}data.events[id]=[...unique.values()];}
const report={checkedAt:new Date().toISOString(),sources:[],articlesChecked:0,added:[],updated:[],candidates:[],failures:[]},today=athensDate(),candidates=[];
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'Accept-Language':'el-GR,el;q=0.9'}});if(!r.ok)throw Error('HTTP '+r.status);return r.text()}
for(const url of ['https://greektheatrecritics.gr/reviews-filtered/','https://www.athinorama.gr/theatre/theatre-reviews/','https://www.athinorama.gr/theatre/theatre-reviews/?page=2']){
 try{const html=await get(url);report.sources.push({url,status:'ok'});
  if(url.includes('greektheatrecritics'))candidates.push(...parseCriticsIndex(html,url));
  else{const urls=[...new Set(links(html,url).map(x=>x.url).filter(u=>/\/theatre-reviews\/\d+\//.test(u)))];let next=0;await Promise.all(Array.from({length:6},async()=>{while(next<urls.length){const u=urls[next++];try{const r=parseReviewArticle(await get(u),u);report.articlesChecked++;if(r)candidates.push(r)}catch(e){report.failures.push({url:u,error:e.message})}}}));}
 }catch(e){report.sources.push({url,status:'failed',error:e.message})}
}
// Prefer the publisher's signed article over an index entry for the same author/date.
candidates.sort((a,b)=>(a.kind==='article'?-1:1)-(b.kind==='article'?-1:1));
for(const r of candidates){const matches=matchReview(r,catalog.events,today);if(matches.length!==1){if(r.publishedAt>=today.slice(0,4)+'-07-01')report.candidates.push({url:r.url,title:r.headline,reason:matches.length?'ambiguous-production':'production-not-confirmed'});continue;}
 const e=matches[0],existing=[...e.reviews,...(details[e.id]?.additionalReviews||[]),...(data.events[e.id]||[])];
 const duplicate=existing.find(x=>x.url===r.url||reviewKey(x)===reviewKey(r));if(duplicate)continue;
 const {headline,productionId,kind,...review}=r;review.id='review-'+createHash('sha256').update(r.url).digest('hex').slice(0,16);review.type='editorial';review.checkedAt=report.checkedAt;
 data.events[e.id]||=[];data.events[e.id].push(review);report.added.push({id:e.id,title:e.title,url:r.url,author:r.author,publishedAt:r.publishedAt});
}
data.checkedAt=report.checkedAt;data.events=Object.fromEntries(Object.entries(data.events).map(([id,reviews])=>[id,reviews.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))]));
report.total=Object.values(data.events).reduce((n,a)=>n+a.length,0);
await writeFile(new URL('data/reviews.json',root),JSON.stringify(data,null,2)+'\n');await writeFile(new URL('data/reviews-report.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sources:report.sources,added:report.added.length,total:report.total,candidates:report.candidates.length}));
if(report.sources.every(s=>s.status==='failed'))process.exitCode=1;
