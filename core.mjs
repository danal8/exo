export function normalize(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/ς/g,'σ').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
export function athensDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function addDays(day,count){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10)}
// Reject stale date-specific source text instead of guessing a new month or season.
export function scheduleExpired(event,today=athensDate()){
 const raw=String(event.scheduleText||'');
 if(!/\d\s*\/\s*\d/.test(raw))return false;
 // A genuinely new, explicitly dated ticket/official programme supersedes old prose.
 const v=event.verification;
 if(v?.state==='verified'&&['official','ticket'].includes(v.kind)&&(event.dates||[]).some(d=>validDay(d.date)&&d.date>=today))return false;
 const clauses=raw.split(/(?:Δευτ?|Τρ|Τετ|Πέμ|Παρ|Σάβ|Κυρ)\.?/iu).map(x=>x.trim()).filter(Boolean);
 if(clauses.some(c=>!/\d\s*\/\s*\d/.test(c)&&/\d/.test(c)))return false;
 const year=Number(String(event.start||today).slice(0,4)),startMonth=Number(String(event.start||today).slice(5,7));
 const dates=[];
 for(const m of raw.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(20\d{2}))?/g)){
  const month=+m[2],day=+m[1],y=m[3]?+m[3]:year+(startMonth>=8&&month<=6?1:0);
  const date=String(y)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  if(!validDay(date))return false;
  dates.push(date);
 }
 return dates.length>0&&dates.every(d=>d<today);
}
export function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value}

export function occurrences(event,from=athensDate(),limit=10){const result=[];if(scheduleExpired(event,from)||event.programmeStatus==='cancelled'||event.programmeStatus==='postponed')return result;if(event.dates)return event.dates.filter(x=>validDay(x.date)&&x.date>=from&&(!event.start||x.date>=event.start)&&(!event.end||x.date<=event.end)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')).slice(0,limit);for(let day=from>event.start?from:event.start;day<=event.end&&result.length<limit;day=addDays(day,1)){const weekday=new Date(day+'T12:00:00Z').getUTCDay();for(const time of event.weekly?.[weekday]||[])result.push({date:day,time})}return result.slice(0,limit)}
export function freshness(event,now=new Date()){
 if(event.programmeStatus==='cancelled')return {state:'cancelled',label:'Η εκδήλωση ακυρώθηκε'};
 if(event.programmeStatus==='postponed')return {state:'pending',label:'Αναβολή · αναμένεται νέο πρόγραμμα'};
 if(scheduleExpired(event,athensDate(now))||!event.endOpen&&event.end<athensDate(now))return {state:'ended',label:'Το καταχωρισμένο πρόγραμμα ολοκληρώθηκε'};
 const v=event.verification,age=v?now-new Date(v.checkedAt):Infinity;
 if(v?.state==='verified'&&['official','ticket'].includes(v.kind)&&v.evidence==='future-dated-event'&&age>=0&&age<=72*3600000&&occurrences(event,athensDate(now),1).length)return {state:'verified',label:'Μελλοντικές ημερομηνίες επιβεβαιωμένες'};
 return {state:'pending',label:event.scheduleKnown===false?'Διάστημα ανακοινωμένο · ώρες στην πηγή':'Χρειάζεται επιβεβαίωση προγράμματος'};
}
export function periodDates(period,today=athensDate()){if(period==='today')return [today];if(period==='tomorrow')return [addDays(today,1)];if(period==='weekend'){const weekday=new Date(today+'T12:00:00Z').getUTCDay();if(weekday===0)return [today];const saturday=addDays(today,(6-weekday+7)%7);return [saturday,addDays(saturday,1)]}return null}
export function venueKey(value){return normalize(value).replace(/^θεατρο /,'').replace(/ θεατρο$/,'')}
export function matches(event,filters,today=athensDate()){const needle=normalize(filters.query);return !scheduleExpired(event,today)&&event.programmeStatus!=='cancelled'&&event.programmeStatus!=='postponed'&&(!event.end||event.end>=today)&&(!needle||normalize([event.title,event.venue,event.area,event.director,...event.cast].join(' ')).includes(needle))&&(filters.category==='all'||event.category===filters.category)&&(!filters.venue||filters.venue==='all'||venueKey(event.venue)===venueKey(filters.venue))&&(filters.area==='all'||event.area===filters.area)&&(!filters.reviewed||(event.audienceRatings?.some(r=>r.count>0)))&&(!filters.saved||filters.savedIds.has(event.id))&&(!filters.date||occurrences(event,filters.date,1000).some(x=>x.date===filters.date))&&(filters.period==='all'||occurrences(event,today,1000).some(x=>periodDates(filters.period,today).includes(x.date)))}
// Evidence only: title similarity creates candidates; it never establishes production identity.
export function productionMatch(a,b){if(normalize(a.title)!==normalize(b.title))return {score:0,decision:'different'};if(a.season&&b.season&&a.season!==b.season)return {score:0,decision:'different'};if(a.director&&b.director&&normalize(a.director)!==normalize(b.director))return {score:0,decision:'different'};if(a.venue&&b.venue&&normalize(a.venue)!==normalize(b.venue))return {score:0,decision:'different'};let score=0;if(a.venue&&b.venue&&normalize(a.venue)===normalize(b.venue))score+=30;if(a.director&&b.director&&normalize(a.director)===normalize(b.director))score+=25;if(a.start&&a.end&&b.start&&b.end&&a.start<=b.end&&b.start<=a.end)score+=20;const ac=(a.cast||[]).map(normalize),bc=(b.cast||[]).map(normalize);if(ac.length&&bc.length&&ac.filter(x=>bc.includes(x)).length/Math.min(ac.length,bc.length)>=.5)score+=15;if(a.officialUrl&&b.officialUrl&&a.officialUrl===b.officialUrl)score+=10;return {score,decision:score>=80?'match':score>=55?'review':'different'}}

