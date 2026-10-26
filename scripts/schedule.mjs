// Parse only explicit, unambiguous Greek weekly time groups.
const days=[[/Κυρ/giu,0],[/Δευτ?/giu,1],[/Τρ(?:ίτη)?/giu,2],[/Τετ/giu,3],[/Πέμ(?:πτη)?/giu,4],[/Παρ/giu,5],[/Σάβ/giu,6]];
export function greekWeekly(value){
 if(!value||/\d+\s*\/\s*\d+/.test(value))return null;
 const weekly={};let previous=0,recognized=0;
 for(const m of value.matchAll(/(\d{1,2})(?:[.:](\d{2}))?\s*(π\.?\s*μ\.?|μ\.?\s*μ\.?|μ\.?(?=\s|$))/giu)){
  const head=value.slice(previous,m.index),found=[];
  for(const [rx,day]of days){rx.lastIndex=0;for(const match of head.matchAll(rx))found.push({day,index:match.index,end:match.index+match[0].length})}
  found.sort((a,b)=>a.index-b.index);if(!found.length)return null;
  let selected=found.map(x=>x.day);
  if(found.length===2&&/[-–]/.test(head.slice(found[0].end,found[1].index))){selected=[];for(let d=found[0].day;;d=(d+1)%7){selected.push(d);if(d===found[1].day)break}}
  let hour=+m[1],minute=+(m[2]||0);if(hour>12||hour<1||minute>59)return null;
  if(/^π/i.test(m[3]))hour=hour===12?0:hour;else hour=hour===12?12:hour+12;
  const time=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
  for(const day of selected){weekly[day]||=[];if(!weekly[day].includes(time))weekly[day].push(time)}
  previous=m.index+m[0].length;recognized++;
 }
 return recognized?weekly:null;
}
