import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavoriteStore,indexedFavorites} from '../favorites.mjs';
const blocked={getItem(){throw Error('SecurityError')},setItem(){throw Error('SecurityError')}};
function memory(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}}
function disk(){let value;return {read:async()=>value,write:async record=>{value=structuredClone(record)}}}
test('Blocked localStorage still persists across a new application session',async()=>{
 const durable=disk(),store=createFavoriteStore({local:blocked,durable});
 assert.equal(await store.save(['moby','spike']),true);
 assert.deepEqual(await createFavoriteStore({local:blocked,durable}).load(),['moby','spike']);
});
test('A newer fallback including an empty list supersedes an old local copy',async()=>{
 const local=memory(),durable=disk();await createFavoriteStore({local,durable,clock:()=>10}).save(['old']);
 const restricted={getItem:local.getItem,setItem:blocked.setItem};
 const store=createFavoriteStore({local:restricted,durable,clock:()=>20});await store.load();await store.save([]);
 assert.deepEqual(await createFavoriteStore({local,durable}).load(),[]);
});
test('Rapid toggles are serialized and the final list survives reload',async()=>{
 const durable=disk(),store=createFavoriteStore({local:blocked,durable,clock:()=>5});
 await Promise.all([store.save(['a']),store.save(['a','b']),store.save(['b'])]);
 assert.deepEqual(await createFavoriteStore({local:blocked,durable}).load(),['b']);
});
test('Legacy favorites migrate and a failed IndexedDB falls back to local storage',async()=>{
 const local=memory();local.setItem('exo:saved:v1',JSON.stringify(['existing',7]));
 const durable={read:async()=>{throw Error('blocked')},write:async()=>{throw Error('blocked')}};
 const store=createFavoriteStore({local,durable});assert.deepEqual(await store.load(),['existing']);
 assert.equal(await store.save(['existing','new']),true);
 assert.deepEqual(await createFavoriteStore({local,durable}).load(),['existing','new']);
});
test('Failure of both stores is reported rather than claiming persistence',async()=>{
 const store=createFavoriteStore({local:blocked,durable:{read:async()=>{throw Error()},write:async()=>{throw Error()}}});
 assert.deepEqual(await store.load(),[]);assert.equal(await store.save(['a']),false);
});
test('IndexedDB reports success only after transaction commit',async()=>{
 let transaction,request,action={};
 const db={close(){},transaction(){transaction={objectStore:()=>({put:()=>action})};return transaction}};
 const factory={open(){request={};queueMicrotask(()=>{request.result=db;request.onsuccess()});return request}};
 let settled=false;const result=indexedFavorites(factory).write({ids:['a'],updatedAt:1}).then(()=>settled=true);
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(settled,false);
 transaction.oncomplete();await result;assert.equal(settled,true);
});
