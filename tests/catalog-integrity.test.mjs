import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const c=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
test('Catalogue retains source identity and valid schedule boundaries',()=>{assert.ok(c.events.length>=552);assert.equal(new Set(c.events.map(e=>e.id)).size,c.events.length);for(const e of c.events){assert.ok(e.title&&e.venue&&e.sources.length,e.id);assert.ok(e.start<=e.end,e.id);assert.ok(Array.isArray(e.cast)&&Array.isArray(e.reviews),e.id);for(const s of e.sources)assert.equal(new URL(s.url).protocol,'https:');for(const d of e.dates||[])assert.match(d.date,/^\d{4}-\d{2}-\d{2}$/);if(e.verification?.state==='verified'){assert.ok(['official','ticket'].includes(e.verification.kind));assert.equal(e.verification.evidence,'future-dated-event')}}});
