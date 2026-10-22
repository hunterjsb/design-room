import {createHmac,timingSafeEqual} from 'node:crypto';
import {HttpError} from './model';
export type AgentGrant={id:string,scope:'read'|'write',label:string};
export type SessionIdentity=Identity&{agent?:AgentGrant};
export type Identity={login:string,name:string,avatar:string};
export function issueSession(user:Identity,key:string,now=Math.floor(Date.now()/1000),agent?:AgentGrant){const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({...user,...(agent?{agent}:{}),iss:'design-room',aud:'board-api',iat:now,exp:now+8*3600})).toString('base64url');return head+'.'+payload+'.'+createHmac('sha256',key).update(head+'.'+payload).digest('base64url')}
export function verifySession(token:string,key:string,now=Math.floor(Date.now()/1000)):SessionIdentity{try{const [head,payload,signature,...extra]=token.split('.');if(extra.length||!head||!payload||!signature)throw Error();const expected=createHmac('sha256',key).update(head+'.'+payload).digest(),actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();const h=JSON.parse(Buffer.from(head,'base64url').toString()),p=JSON.parse(Buffer.from(payload,'base64url').toString());if(h.alg!=='HS256'||p.iss!=='design-room'||p.aud!=='board-api'||!Number.isFinite(p.exp)||p.exp<=now||p.iat>now+60||typeof p.login!=='string'||!p.login)throw Error();if(p.agent&&(!/^[A-Z0-9]{10}$/.test(p.agent.id)||!['read','write'].includes(p.agent.scope)||typeof p.agent.label!=='string'||p.agent.label.length>80))throw Error();return {login:p.login,name:p.name,avatar:p.avatar,...(p.agent?{agent:p.agent}:{})}}catch{throw new HttpError(401,'Sign in to access this workspace.')}}
export async function githubIdentity(token:string,repository:string,request:typeof fetch=fetch,mode:'token'|'app'='token'):Promise<Identity>{if(typeof token!=='string'||!token||token.length>500)throw new HttpError(401,'Enter a valid GitHub token.');const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'design-room'};const response=await request('https://api.github.com/user',{headers,signal:AbortSignal.timeout(10000)});if(!response.ok)throw new HttpError(401,'GitHub could not verify this token.');const user:any=await response.json();if(typeof user.login!=='string')throw new HttpError(401,'GitHub identity is unavailable.');if(mode==='app'){await checkAppMembership(repository,headers,request);return {login:user.login,name:user.name||user.login,avatar:user.avatar_url||''}}const permission=await request('https://api.github.com/repos/'+repository+'/collaborators/'+encodeURIComponent(user.login)+'/permission',{headers,signal:AbortSignal.timeout(10000)});if(!permission.ok)throw new HttpError(403,'This GitHub account is not approved for this workspace, or the token lacks repository metadata access.');const role:any=await permission.json();if(!['admin','write','maintain'].includes(role.permission)&&!['admin','write','maintain'].includes(role.role_name))throw new HttpError(403,'Workspace access requires write membership in the configured GitHub repository.');return {login:user.login,name:user.name||user.login,avatar:user.avatar_url||''};}

// GitHub App tokens expose the user's repository permissions through the
// installation API. Do not infer write access from the app's own permissions.
function installationError(repository:string,message:string){const slug=process.env.GITHUB_APP_SLUG||'';return new HttpError(403,message,{code:'github_installation_required',setup:{repository,owner:repository.split('/')[0],installationUrl:slug?'https://github.com/apps/'+encodeURIComponent(slug)+'/installations/new':''}})}
async function checkAppMembership(repository:string,headers:Record<string,string>,request:typeof fetch){
  const owner=repository.split('/')[0].toLowerCase();
  async function read(path:string){
    const response=await request('https://api.github.com'+path,{headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok){console.warn('GitHub installation access check failed',{status:response.status,requestId:response.headers.get('x-github-request-id')});throw new HttpError(response.status===429||response.status>=500?503:403,'GitHub could not verify the sign-in app’s repository access. Ask the workspace administrator to check the app installation, then sign in again.');}
    return response.json() as Promise<any>;
  }
  let installation:any;
  for(let page=1;page<=100;page++){
    const data=await read('/user/installations?per_page=100&page='+page);
    if(!Array.isArray(data.installations))throw new HttpError(503,'GitHub returned incomplete installation information. Try again.');
    installation=data.installations.find((entry:any)=>entry.account?.login?.toLowerCase()===owner&&!entry.suspended_at);
    if(installation)break;
    if(data.installations.length<100)throw installationError(repository,'The sign-in app has no accessible installation for '+repository+'. The repository owner needs to connect it once. Other members only need to sign in.');
  }
  if(!installation||!Number.isSafeInteger(installation.id))throw new HttpError(503,'GitHub installation access could not be verified. Try again.');
  for(let page=1;page<=100;page++){
    const data=await read('/user/installations/'+installation.id+'/repositories?per_page=100&page='+page);
    if(!Array.isArray(data.repositories))throw new HttpError(503,'GitHub returned incomplete repository information. Try again.');
    const repo=data.repositories.find((entry:any)=>entry.full_name?.toLowerCase()===repository.toLowerCase());
    if(repo){const permissions=repo.permissions;if(permissions?.push===true||permissions?.admin===true||permissions?.maintain===true)return;throw new HttpError(403,'Workspace access requires write membership in '+repository+'. This GitHub account has read-only access.');}
    if(data.repositories.length<100)throw installationError(repository,'The sign-in app cannot access '+repository+'. Select that repository in the app installation settings, then continue.');
  }
  throw new HttpError(503,'GitHub repository access could not be verified. Try again.');
}
