import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const dashboardSource=await readFile(new URL('../assets/js/exhibitor-dashboard-ui.js',import.meta.url),'utf8');
const controllerSource=await readFile(new URL('../assets/js/controllers/exhibitor.controller.js',import.meta.url),'utf8');
const pageSource=await readFile(new URL('../area-expositor.html',import.meta.url),'utf8');

test('dashboard views do not scroll unless the caller explicitly requests it',()=>{
 assert.match(dashboardSource,/function applyView\(view, \{ scroll = false \} = \{\}\)/);
 assert.match(dashboardSource,/if \(scroll\) window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
 assert.equal((dashboardSource.match(/window\.scrollTo/g)||[]).length,1);
});

test('only sidebar navigation requests automatic scrolling',()=>{
 assert.match(dashboardSource,/sidebar\.addEventListener\('click',[\s\S]*?applyView\(link\.dataset\.exhibitorView, \{ scroll: true \}\)/);
 assert.match(dashboardSource,/main\.addEventListener\('click',[\s\S]*?applyView\(button\.dataset\.exhibitorView, \{ scroll: false \}\)/);
 assert.match(dashboardSource,/MutationObserver\([\s\S]*?applyView\(currentView, \{ scroll: false \}\)/);
});

test('sidebar view attributes remain limited to actual dashboard navigation',()=>{
 const viewAttributes=[...pageSource.matchAll(/data-exhibitor-view="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(viewAttributes,['overview','opportunities','applications','spaces','evaluations','profile','portfolio']);
 assert.doesNotMatch(controllerSource,/data-exhibitor-view/);
});

test('internal exhibitor actions update their own interface without rebuilding the dashboard',()=>{
 assert.doesNotMatch(controllerSource,/await exhibitorDashboard\(\)/);
 assert.match(controllerSource,/updatePortfolio\(main,updatedProfile\.portfolio,feedback\)/);
 assert.match(controllerSource,/badge\.outerHTML=status\('CANCELLED'\)/);
 assert.match(controllerSource,/badge\.textContent='Avaliação enviada'/);
});

test('the explicit back-to-top control remains available',()=>{
 assert.match(dashboardSource,/link\.className = 'back-to-top'/);
 assert.match(dashboardSource,/link\.href = '#conteudo'/);
});
