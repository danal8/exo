import {text,decode,links,safeUrl} from './source-parser.mjs';
import {normalize} from '../core.mjs';
export function parseCriticsIndex(html,url){
 const reviews=[];
 for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']*\/kritikes\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const title=text(m[2].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
  const author=text(m[2].match(/<div\b[^>]*class=["'][^"']*vc_acf[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).replace(/^(του|της)\s+/i,'');
  const publishedAt=m[2].match(/<time\b[^>]*datetime=["'](\d{4}-\d{2}-\d{2})/i)?.[1];
  if(title&&author&&publishedAt)reviews.push({headline:title,author,publishedAt,url:safeUrl(m[1],url),source:'Greek Theatre Critics',summary:'Παρουσίαση και αξιολόγηση της συγκεκριμένης σκηνικής παραγωγής από την υπογράφουσα κριτικό ή τον υπογράφοντα κριτικό.',score:null,scale:null,kind:'index'});
 }
 return reviews;
}
export function parseReviewArticle(html,url){
 const nodes=[];const walk=v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return}if(v['@type'])nodes.push(v);Object.entries(v).filter(([k])=>k!=='@context').forEach(([,v])=>walk(v))};
 for(const m of html.matchAll(/<script\b[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi))try{walk(JSON.parse(m[1]))}catch{}
 const article=nodes.find(n=>/NewsArticle|Article/.test(n['@type'])),review=nodes.find(n=>n['@type']==='Review');
 if(!article||!review)return null;
 const author=typeof review.author==='string'?review.author:review.author?.name||article.author?.name;
 const publishedAt=article.datePublished?.slice(0,10);if(!author||!publishedAt||/team|ομαδα|συνταξη/i.test(normalize(author)))return null;
 const refs=JSON.stringify(article.mentions||{}),productionId=refs.match(/performance\/[^"\s]*-(\d+)/)?.[1];
 const score=Number(review.reviewRating?.ratingValue),scale=Number(review.reviewRating?.bestRating||5);
 return {headline:text(article.headline),author,publishedAt,url,source:new URL(url).hostname.replace('www.',''),productionId,summary:text(article.description||'').split(/\s+/).slice(0,20).join(' ')+'…',score:Number.isFinite(score)&&score>=0&&score<=scale?score:null,scale:Number.isFinite(score)?scale:null,kind:'article'};
}
const compact=s=>normalize(s).split(' ').filter(t=>!['θεατρο','του','τησ','των','ο','η','το','οι','τα'].includes(t)).map(t=>t.replace(/σ$/,'')).join(' ');
export function matchReview(review,events,today){
 // An older review cannot silently become a review of this season's revival.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(review.publishedAt||'')||review.publishedAt>today)return [];
 return events.filter(e=>{
  if(e.category!=='theatre')return false;
  const year=+(e.season||e.start||today).slice(0,4);if(review.publishedAt<year+'-07-01')return false;
  if(review.productionId)return String(e.sourceProductionId)===review.productionId;
  const quoted=review.headline.match(/[«“"]([^»”"]+)[»”"]/);if(!quoted||normalize(quoted[1])!==normalize(e.title))return false;
  const context=compact(review.headline),venue=compact(e.venue),surname=compact(e.director?.split(/\s+/).at(-1)||'');
  const hasVenue=venue.length>4&&context.includes(venue),hasDirector=surname.length>4&&context.includes(surname);
  return hasVenue&&hasDirector;
 });
}
export function reviewKey(r){const tokens=normalize(r.author).split(' ');return (tokens[0]||'').slice(0,3)+' '+(tokens.at(-1)||'').replace(/σ$/,'')+'|'+r.publishedAt}
