const KEY='exo:saved:v2',LEGACY='exo:saved:v1';
const valid=v=>v&&Number.isFinite(v.updatedAt)&&Array.isArray(v.ids)&&v.ids.every(x=>typeof x==='string');
const parse=s=>{try{return JSON.parse(s)}catch{return null}};

// Read both copies: a failed localStorage write must never resurrect an older list.
export function createFavoriteStore({local,durable,clock=()=>Date.now()}){
 let revision=0,queue=Promise.resolve();
 async function load(){
  const copies=await Promise.allSettled([Promise.resolve().then(()=>parse(local.getItem(KEY))),Promise.resolve().then(()=>durable.read())]);
  const records=copies.filter(x=>x.status==='fulfilled'&&valid(x.value)).map(x=>x.value).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(records.length){revision=records[0].updatedAt;return records[0].ids;}
  try{const old=parse(local.getItem(LEGACY));if(Array.isArray(old))return old.filter(x=>typeof x==='string')}catch{}
  return [];
 }
 function save(ids){
  const record={ids:[...new Set(ids)],updatedAt:revision=Math.max(clock(),revision+1)};
  const task=queue.then(async()=>{
   const results=await Promise.allSettled([Promise.resolve().then(()=>local.setItem(KEY,JSON.stringify(record))),Promise.resolve().then(()=>durable.write(record))]);
   return results.some(x=>x.status==='fulfilled');
  });
  queue=task.catch(()=>{});return task;
 }
 return {load,save};
}

export function indexedFavorites(factory){
 function operation(mode,record){return new Promise((resolve,reject)=>{
  let db,finished=false;
  const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);db?.close();error?reject(error):resolve(value)};
  const timer=setTimeout(()=>finish(Error('Favorite storage timeout')),2500);
  try{
   const request=factory.open('exo-preferences',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('preferences'))request.result.createObjectStore('preferences')};
   request.onerror=()=>finish(request.error||Error('Favorite storage unavailable'));
   request.onblocked=()=>finish(Error('Favorite storage blocked'));
   request.onsuccess=()=>{
    db=request.result;if(finished){db.close();return;}
    try{
     const transaction=db.transaction('preferences',mode),store=transaction.objectStore('preferences');
     const action=mode==='readonly'?store.get('favorites'):store.put(record,'favorites');
     transaction.oncomplete=()=>finish(null,action.result);
     transaction.onabort=transaction.onerror=()=>finish(transaction.error||Error('Favorite storage failed'));
    }catch(error){finish(error)}
   };
  }catch(error){finish(error)}
 })}
 return {read:()=>operation('readonly'),write:record=>operation('readwrite',record)};
}

export function browserFavoriteStore(host=globalThis){
 // Accessors can themselves throw in restricted browsers.
 const local={getItem:key=>host.localStorage.getItem(key),setItem:(key,value)=>host.localStorage.setItem(key,value)};
 const durable={read:()=>indexedFavorites(host.indexedDB).read(),write:record=>indexedFavorites(host.indexedDB).write(record)};
 return createFavoriteStore({local,durable});
}
