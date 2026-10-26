import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePage,enrich,ticketPoster} from '../scripts/source-parser.mjs';
const url='https://www.more.com/gr-el/venues/stayros/';
const page='<h1>Σταυρός του Νότου</h1><img alt="ΧΡΗΣΤΟΣ ΘΗΒΑΙΟΣ ΣΤΟ ΣΤΑΥΡΟ ΤΟΥ ΝΟΤΟΥ PLUS" src="https://www.more.com/getattachment/a/poster.jpg"><img alt="Γιώτα Νέγκα" src="https://www.more.com/getattachment/b/poster.jpg">';
test('Selects the matching artist poster from a multi-event venue page',()=>{assert.equal(ticketPoster(page,url,'Χρήστος Θηβαίος'),'https://www.more.com/getattachment/a/poster.jpg');assert.equal(ticketPoster(page,url,'Άλλος Καλλιτέχνης'),null)});
test('A venue poster cannot import venue text or dates into a production',()=>{const e={title:'Χρήστος Θηβαίος',description:'Original synopsis',sources:[],reviews:[],poster:{url:'https://example.com/photo.jpg'}};const p=parsePage(page,url,e.title);assert.equal(p.imageOnly,true);enrich(e,p,{kind:'ticket'});assert.equal(e.poster.kind,'poster');assert.equal(e.poster.fallbackUrl,'https://example.com/photo.jpg');assert.equal(e.description,'Original synopsis');assert.equal(e.verification,undefined)});
test('Lazy loading uses the actual image and never a placeholder',()=>assert.equal(ticketPoster('<img alt="HENGE" src="https://example.com/placeholder.gif" data-src="https://example.com/henge.jpg">',url,'HENGE'),'https://example.com/henge.jpg'));
