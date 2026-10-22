import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function load(file){const r=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});const module={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(require,module,module.exports);return module.exports}
const {issueSession,verifySession,githubIdentity}=await load('api/auth.ts');
const {reviseCatalog,validateBoard,assetKey}=await load('api/model.ts');
const {boardContext}=await load('lib/board.ts');
const {splitTableRow}=await load('lib/markdown-table.ts');
const user={login:'tester',name:'Test',avatar:''},key='test-session-secret';
test('sessions authenticate, expire, and reject tampering',()=>{const token=issueSession(user,key,1000);assert.deepEqual(verifySession(token,key,1001),user);assert.throws(()=>verifySession(token,'wrong',1001));assert.throws(()=>verifySession(token,key,1000+8*3600));assert.throws(()=>verifySession(token+'x',key,1001))});
test('GitHub authentication requires an approved write role',async()=>{const mock=role=>async url=>Response.json(url.endsWith('/user')?{login:'tester'}:{permission:role});assert.equal((await githubIdentity('token','owner/repo',mock('write'))).login,'tester');await assert.rejects(githubIdentity('token','owner/repo',mock('read')),/write membership/);await assert.rejects(githubIdentity(undefined,'owner/repo',mock('admin')),/valid GitHub token/)});
const catalog={pk:'CATALOG',revision:3,boards:[{id:'a',title:'A',type:'freeform',archived:false,deleted:false}],activeIds:['a']};
test('catalog changes check revision and preserve deletion safety',()=>{assert.throws(()=>reviseCatalog(catalog,{action:'rename',revision:2,id:'a',title:'new'},''),/changed/);assert.throws(()=>reviseCatalog(catalog,{action:'delete',revision:3,id:'a'},''),/Refresh/);const r=reviseCatalog(catalog,{action:'create',revision:3,title:'New',type:'document'},'b');assert.deepEqual(r.catalog.activeIds,['a','b']);assert.equal(catalog.boards.length,1);assert.equal(r.catalog.revision,4)});
const node={id:'n',type:'note',title:'Idea',body:'',x:0,y:0,w:100,h:100,color:'sand'};
test('edit attribution is server-owned and unchanged nodes retain it',()=>{const previous={nodes:[{...node,lastEdited:{by:'original',at:'before'}}],edges:[]};const forged={nodes:[{...node,lastEdited:{by:'forged',at:'fake'}}],edges:[]};assert.equal(validateBoard(forged,catalog.boards[0],previous,'tester','now').nodes[0].lastEdited.by,'original');forged.nodes[0].title='Edited';assert.deepEqual(validateBoard(forged,catalog.boards[0],previous,'tester','now').nodes[0].lastEdited,{by:'tester',at:'now'});assert.throws(()=>validateBoard({...forged,document:{markdown:'x'}},catalog.boards[0],previous,'tester','now'),/board type/)});
test('asset keys cannot escape private asset namespaces',()=>{assert.equal(assetKey('/assets/uploads/test.png'),'uploads/test.png');assert.equal(assetKey('/imports/reference/My%20Board.pdf'),'imports/reference/My Board.pdf');for(const p of ['boards/a.json','imports/../secret','uploads//x','uploads/%2e%2e/x'])assert.throws(()=>assetKey(p))});
test('agent context distinguishes spatial hints from explicit links',()=>{const b={nodes:[node,{...node,id:'near',x:150}],edges:[]};const free=boardContext(b,'freeform','a');assert.equal(free.proximity.length,1);assert.equal(free.proximity[0].explicitlyConnected,false);assert.equal(boardContext(b,'kanban','a').proximity.length,0)});
test('wiki references stay intact inside Markdown tables',()=>{assert.deepEqual(splitTableRow('| A | [[board:a#n|Reference]] |'),['A','[[board:a#n|Reference]]'])});
const {exchangeGitHubCode}=await load('api/oauth.ts');
const {acceptCallback,beginGitHubLogin}=await load('lib/oauth-browser.ts');
const oauth={clientId:'test-client',clientSecret:'test-secret',redirectUri:'https://example.com/boards/'},verifier='v'.repeat(43);
test('redirect sign-in checks browser state, age, and local return navigation',()=>{const pending={state:'state',verifier,createdAt:1000,returnSearch:'?board=abc&redirect=https://evil.invalid'};assert.deepEqual(acceptCallback(pending,'state',1001),{verifier,returnSearch:'?board=abc'});assert.throws(()=>acceptCallback(pending,'wrong',1001));assert.throws(()=>acceptCallback(pending,'state',601001));assert.throws(()=>acceptCallback(null,'state',1001));assert.throws(()=>acceptCallback({...pending,createdAt:2000},'state',1001));assert.equal(acceptCallback({...pending,returnSearch:'?redirect=https://evil.invalid'},'state',1001).returnSearch,'')});
test('redirect URL uses random state, S256 PKCE, and no broad OAuth scopes',async()=>{const {pending,url}=await beginGitHubLogin(oauth,'?board=abc');const parsed=new URL(url);assert.equal(parsed.origin,'https://github.com');assert.equal(parsed.searchParams.get('state'),pending.state);assert.equal(parsed.searchParams.get('code_challenge_method'),'S256');assert.equal(parsed.searchParams.get('code_challenge').length,43);assert.notEqual(parsed.searchParams.get('code_challenge'),pending.verifier);assert.equal(parsed.searchParams.has('scope'),false)});
test('code exchange stays server-side and requires membership after GitHub authentication',async()=>{const mock=permission=>async(url,init)=>{if(url.includes('/access_token')){const sent=JSON.parse(init.body);assert.equal(sent.client_secret,oauth.clientSecret);assert.equal(sent.code_verifier,verifier);assert.equal(sent.redirect_uri,oauth.redirectUri);return Response.json({access_token:'temporary-github-token'})}if(url.includes('/user/installations/'))return Response.json({repositories:[{full_name:'owner/repo',permissions:{push:permission==='write'||permission==='admin',pull:true}}]});if(url.includes('/user/installations?'))return Response.json({installations:[{id:1,account:{login:'owner'}}]});return Response.json(url.endsWith('/user')?{login:'tester'}:{permission})};assert.equal((await exchangeGitHubCode({code:'code',verifier},oauth,'owner/repo',mock('write'))).login,'tester');await assert.rejects(exchangeGitHubCode({code:'code',verifier},oauth,'owner/repo',mock('read')),/write membership/);await assert.rejects(exchangeGitHubCode({code:'code',verifier:'short'},oauth,'owner/repo',mock('admin')),/invalid/);await assert.rejects(exchangeGitHubCode({code:'code',verifier},oauth,'owner/repo',async()=>Response.json({error:'bad_verification_code'})),/expired/);await assert.rejects(exchangeGitHubCode({code:'code',verifier},{...oauth,clientSecret:''},'owner/repo',mock('admin')),/setup/)});

test('GitHub App login uses actual user permissions from the matching installation',async()=>{
  const mock=({push=true,installed=true,selected=true,suspended=false,secondPage=false}={})=>async url=>{
    if(url.endsWith('/user'))return Response.json({login:'tester'});
    assert.ok(!url.includes('/collaborators/'),'App login must not rely on collaborator administration endpoints');
    if(url.includes('/user/installations?'))return Response.json({installations:installed?[{id:7,account:{login:'OWNER'},suspended_at:suspended?'yesterday':null}]:[]});
    if(secondPage&&url.endsWith('page=1'))return Response.json({repositories:Array.from({length:100},(_,i)=>({full_name:'owner/other-'+i,permissions:{push:true}}))});
    return Response.json({repositories:selected?[{full_name:'Owner/Repo',permissions:{push,pull:true}}]:[]});
  };
  assert.equal((await githubIdentity('app-token','owner/repo',mock(),'app')).login,'tester');
  assert.equal((await githubIdentity('app-token','owner/repo',mock({secondPage:true}),'app')).login,'tester');
  await assert.rejects(githubIdentity('app-token','owner/repo',mock({push:false}),'app'),/write membership/);
  await assert.rejects(githubIdentity('app-token','owner/repo',mock({installed:false}),'app'),/no accessible installation/);
  await assert.rejects(githubIdentity('app-token','owner/repo',mock({selected:false}),'app'),/cannot access/);
  await assert.rejects(githubIdentity('app-token','owner/repo',mock({suspended:true}),'app'),/no accessible installation/);
});
