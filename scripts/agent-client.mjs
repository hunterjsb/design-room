// Standalone Design Room client. Node 22+, no packages or application checkout.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
const DEFAULT_SITE=__DESIGN_ROOM_SITE__;
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('Supply a value for '+name);args.splice(i,2);return value}
const site=new URL(option('--site',process.env.DESIGN_ROOM_URL||DEFAULT_SITE)),label=option('--label','Coding agent');site.search='';site.hash='';if(!site.pathname.endsWith('/'))site.pathname+='/';
const wantsWrite=args.includes('--write');if(wantsWrite)args.splice(args.indexOf('--write'),1);
const [command='help',id,file]=args;
const out=value=>typeof value==='string'?process.stdout.write(value+'\n'):console.log(JSON.stringify(value,null,2));
async function main(){
if(command==='help'){out('Design Room — no repository clone or npm install required.\nCommands: list | read BOARD | context BOARD | save BOARD envelope.json | catalog action.json | docs [path.md] | asset KEY | export DIRECTORY\nAuthentication: auth gh | auth pair [--label NAME] [--write] | auth status | auth logout\nOptional: --site URL, DESIGN_ROOM_TOKEN, DESIGN_ROOM_SESSION_FILE. auth pair asks a workspace member to approve access in the browser.');return}
const discovery=await fetch(new URL('agents.json',site));if(!discovery.ok)throw Error('Cannot discover this workspace. Check the --site URL.');const manifest=await discovery.json(),api=manifest.apiBase.replace(/\/$/,'');
const apiURL=new URL(api);if(apiURL.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(apiURL.hostname))throw Error('The API must use HTTPS.');
const sessionFile=process.env.DESIGN_ROOM_SESSION_FILE||join(process.env.XDG_CONFIG_HOME||join(homedir(),'.config'),'design-room',createHash('sha256').update(api).digest('hex').slice(0,16)+'.json');
async function request(path,{method='GET',body,token}={}){if(!path.startsWith('/api/'))throw Error('Only workspace API paths are allowed.');const r=await fetch(api+path,{method,redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!r.ok)throw Error(`${r.status}: ${data.error||text}`);return data}
function saveSession(token){mkdirSync(dirname(sessionFile),{recursive:true,mode:0o700});writeFileSync(sessionFile,JSON.stringify({api,token})+'\n',{mode:0o600});chmodSync(sessionFile,0o600)}
async function ghSession(){let token=process.env.GITHUB_TOKEN;if(!token){const r=spawnSync('gh',['auth','token'],{encoding:'utf8'});if(r.status!==0)throw Error('No GitHub CLI sign-in found. Run auth pair to approve access in the browser; no GitHub CLI is required.');token=r.stdout.trim()}const result=await request('/api/auth/github',{method:'POST',body:{token}});saveSession(result.token);return result.token}
async function session(){if(process.env.DESIGN_ROOM_TOKEN)return process.env.DESIGN_ROOM_TOKEN;let stored;try{stored=JSON.parse(readFileSync(sessionFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('Could not read the saved session. Use auth logout and sign in again.')}if(stored?.api===api&&stored.token){const claim=JSON.parse(Buffer.from(stored.token.split('.')[1],'base64url').toString());if(claim.exp<=Date.now()/1000)throw Error('Session expired. Run auth pair or auth gh again.');return stored.token}return ghSession()}
if(command==='auth'&&id==='logout'){try{unlinkSync(sessionFile)}catch(e){if(e.code!=='ENOENT')throw e}out('Local session removed. Approved browser connections can also be revoked from their approval page.');return}
if(command==='auth'&&id==='gh'){await ghSession();out('Connected through GitHub CLI. Session saved locally; no token printed.');return}
if(command==='auth'&&id==='pair'){
  const pair=await request('/api/agent/pair',{method:'POST',body:{label,scope:wantsWrite?'write':'read'}});
  console.error('Ask a workspace member to approve this connection:\n'+pair.approvalUrl+'\nCode: '+pair.code+'\nAgent: '+label+'\nRequested access: '+(wantsWrite?'read and write':'read only')+'\nWaiting up to 10 minutes. Do not approve this request yourself on someone else’s behalf.');
  const deadline=Date.now()+pair.expiresIn*1000;
  while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,Math.max(5,pair.interval)*1000));const result=await request('/api/agent/pair/poll',{method:'POST',body:{code:pair.code,deviceSecret:pair.deviceSecret}});if(result.status==='connected'){saveSession(result.token);out({status:'connected',scope:result.scope,expiresAt:result.expiresAt,approvalUrl:pair.approvalUrl});return}}
  throw Error('Approval request expired. Run auth pair again.');
}
const token=await session(),get=path=>request(path,{token});
if(command==='auth'&&id==='status'){const me=await get('/api/me');const claim=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());out({connected:true,user:me.user.login,scope:claim.agent?.scope||'member',expiresAt:claim.exp});return}
if(command==='list')return out(await get('/api/boards'));
if(command==='read'||command==='context'){if(!id)throw Error('Supply a board ID.');return out(await get('/api/board?board='+encodeURIComponent(id)+(command==='context'?'&context=1':'')))}
if(command==='save'){if(!id||!file)throw Error('Usage: save BOARD envelope.json');const body=JSON.parse(readFileSync(file,'utf8'));if(!body.board||!Number.isInteger(body.revision))throw Error('Use the board + revision envelope returned by read.');return out(await request('/api/board?board='+encodeURIComponent(id),{method:'PUT',body,token}))}
if(command==='catalog'){if(!id)throw Error('Supply an API action JSON file, including its expected catalog revision.');return out(await request('/api/boards',{method:'POST',body:JSON.parse(readFileSync(id,'utf8')),token}))}
if(command==='docs')return out(await get('/api/documents'+(id?'/'+id.split('/').map(encodeURIComponent).join('/'):'')));
if(command==='asset'){if(!id)throw Error('Supply the canonical asset key.');return out(await get('/api/assets?key='+encodeURIComponent(id)))}
if(command==='export'){if(!id)throw Error('Supply a private output directory. Never export into a public repository.');mkdirSync(id,{recursive:true,mode:0o700});const catalog=await get('/api/boards');writeFileSync(join(id,'catalog.json'),JSON.stringify(catalog,null,2),{mode:0o600});for(const board of catalog.boards)writeFileSync(join(id,board.id+'.json'),JSON.stringify(await get('/api/board?board='+encodeURIComponent(board.id)),null,2),{mode:0o600});out('Exported '+catalog.boards.length+' boards. Keep these files private.');return}
throw Error('Unknown command. Run help.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
