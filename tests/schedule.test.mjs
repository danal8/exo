import test from 'node:test';
import assert from 'node:assert/strict';
import {greekWeekly} from '../scripts/schedule.mjs';
test('Day ranges and shared afternoon hours',()=>assert.deepEqual(greekWeekly('Πέμ.-Σάβ. 9 μ.μ., Κυρ., Τετ. 8 μ.μ.'),{0:['20:00'],3:['20:00'],4:['21:00'],5:['21:00'],6:['21:00']}));
test('Noon and morning are parsed correctly',()=>{assert.deepEqual(greekWeekly('Κυρ. 12 μ.'),{0:['12:00']});assert.deepEqual(greekWeekly('Σάβ. 11.30 π.μ.'),{6:['11:30']})});
test('Date-specific mixed programmes stay unparsed',()=>{assert.equal(greekWeekly('Πέμ. 8, 15, 22, 29/9, 9 μ.μ.'),null);assert.equal(greekWeekly('Δείτε το πρόγραμμα'),null)});
