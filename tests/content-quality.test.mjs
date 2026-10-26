import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePage,enrich} from '../scripts/source-parser.mjs';
test('Venue navigation and logo cannot replace production content',()=>{
 const html='<meta property="og:image" content="https://example.com/Logo-Transparent.png"><nav><a href="https://www.more.com/theater/wrong/">Εισιτήρια</a></nav><h1>Μόμπι Ντικ</h1><p>ΠΡΕΜΙΕΡΑ ΕΙΣΙΤΗΡΙΑ ΠΡΕΜΙΕΡΑ ΕΙΣΙΤΗΡΙΑ</p><h2>Λίγα Λόγια για την Υπόθεση του Έργου</h2><p>Ο καπετάνιος Αχαάβ αναζητά τη λευκή φάλαινα και παρασύρει το πλήρωμά του σε ένα επικίνδυνο ταξίδι εκδίκησης.</p><a href="https://www.more.com/theater/mompintik/">Εισιτήρια</a>';
 const p=parsePage(html,'https://example.com/moby');
 assert.equal(p.image,null);assert.match(p.description,/Αχαάβ/);assert.match(p.ticketUrl,/mompintik/);
 const e={title:'Μόμπι Ντικ',description:'Ελεγμένη περίληψη.',descriptionSource:{kind:'summary',authority:'official'},ticketUrl:'https://www.more.com/theater/mompintik/',sources:[],reviews:[]};
 enrich(e,{...p,ticketUrl:'https://www.more.com/theater/wrong/'},{kind:'official'});
 assert.equal(e.description,'Ελεγμένη περίληψη.');assert.match(e.ticketUrl,/mompintik/);
});
