import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
async function load(file){const r=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',define:{'import.meta.env':'{}'}});const m={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,m,m.exports);return m.exports}
const {pageOf,documentSection,documentHeadings,replaceDocumentRange}=await load('lib/collection-view.ts');
const {parseReleaseDocument}=await load('lib/release-layout.ts');
const {boardContext,defaultPlanning}=await load('lib/board.ts');
const {validateBoard}=await load('api/model.ts');
const {KanbanBoard}=await load('components/kanban-board.tsx');
const {ReleaseDocument}=await load('components/release-document.tsx');
const node={id:'n',type:'idea',title:'Work',body:'Full detail',x:0,y:0,w:280,h:220,color:'sand'};
const entry={id:'roadmap',title:'Roadmap',type:'kanban',archived:false,deleted:false};
test('large roadmaps keep release proposals out of task status and page work cards',()=>{
 const nodes=Array.from({length:4900},(_,i)=>({...node,id:'work-'+i,title:'Work '+i,planning:defaultPlanning()}));
 nodes.push(...Array.from({length:100},(_,i)=>({...node,id:'release-'+i,title:'Release '+i,releasePlan:{version:'0.'+i,phase:'Alpha',state:'proposal',documentRef:'[[board:releases#release-'+i+']]'}})));
 const b=validateBoard({nodes,edges:[]},entry,{nodes:[],edges:[]},'test','now');assert.equal(b.nodes.length,5000);
 const context=boardContext(b,'kanban','roadmap');assert.equal(context.development.items.length,4900);assert.equal(context.releasePlans.length,100);assert.deepEqual(context.proximity,[]);assert.deepEqual(context.groups,[]);
 const html=renderToStaticMarkup(React.createElement(KanbanBoard,{board:b,selected:null,search:'',disabled:false,onChange(){},onSelect(){},onAdd(){},onAddRelease(){},onOpen(){}}));
 assert.equal((html.match(/class="work-card /g)||[]).length,25);assert.equal((html.match(/class="release-plan-row /g)||[]).length,20);assert(html.includes('4900'));assert(!html.includes('Work 4899</button>'));
 assert.throws(()=>validateBoard({...b,nodes:[{...b.nodes.at(-1),planning:defaultPlanning()}]},entry,b,'test','now'),/separate/);
 assert.throws(()=>validateBoard(b,{...entry,type:'freeform'},b,'test','now'),/500 visual/);
});
test('thousands of release summaries render a bounded page, preserving patches and fenced headings',()=>{
 const markdown='# Releases\n\n## Alpha\n\n'+Array.from({length:1000},(_,i)=>'### 0.'+i+' · Plan\n\nPRIVATE_FULL_DETAIL_'+i+'\n\n#### 0.'+i+'.1\n\n- [ ] Patch acceptance\n\n').join('')+'```md\n### 0.9000 · Not a release\n```\n';
 const layout=parseReleaseDocument(markdown);assert.equal(layout.groups[0].cards.length,1000);assert.equal(layout.groups[0].cards[2].fragments.length,2);
 const html=renderToStaticMarkup(React.createElement(ReleaseDocument,{markdown,disabled:false,onOpen(){},onToggleTask(){},onAddRelease(){}}));
 assert.equal((html.match(/class="release-card"/g)||[]).length,20);assert.equal((html.match(/class="markdown/g)||[]).length,1);assert(!html.includes('class="release-fragment '));assert(!html.includes('id="0999-plan"'));assert(html.includes('Page 1 / 50'));
 assert.equal(pageOf(layout.groups[0].cards,999,20).page,49);
 const legacy=parseReleaseDocument('# Releases\n## 0.2\nbody\n### 0.2.1\npatch\n## 0.3 · Sanddune\nnext');assert.equal(legacy.groups[0].cards.length,2);assert.equal(legacy.groups[0].cards[0].fragments.length,2);
});
test('section references and scoped edits retain unrelated release content and exact line offsets',()=>{
 const markdown='# Releases\n\n## 0.4 · Harbor\n\n### Harbor · Candidate\n\n- [ ] A\n\n```md\n## Fake\n```\n\n## 0.5 · Garden\n\nUnrelated exact words.\n';
 assert(!documentHeadings(markdown).some(h=>h.title==='Fake'));
 const part=documentSection(markdown,'harbor-candidate');assert(part);assert.equal(part.startLine,4);assert(part.markdown.includes('## Fake'));assert(!part.markdown.includes('Unrelated'));
 const context=boardContext({nodes:[],edges:[],document:{markdown}},'document','releases','harbor-candidate');assert.equal(context.document.markdown,part.markdown);assert(!JSON.stringify(context).includes('Unrelated exact words'));
 const changed=replaceDocumentRange(markdown,part.startLine,part.endLine,part.markdown.replace('[ ]','[x]'));assert.equal(changed.slice(changed.indexOf('## 0.5')),markdown.slice(markdown.indexOf('## 0.5')));
 const b={nodes:[{...node,id:'target',planning:{...defaultPlanning(),dependsOn:['dep']}},{...node,id:'dep',planning:defaultPlanning()},{...node,id:'unrelated',body:'Do not read this'}],edges:[]};
 const selected=boardContext(b,'kanban','roadmap','target');assert.deepEqual(selected.nodes.map(n=>n.id),['target','dep']);assert(!JSON.stringify(selected).includes('Do not read this'));
});
