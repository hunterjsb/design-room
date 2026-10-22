export type PendingLogin={state:string,verifier:string,createdAt:number,returnSearch:string};
export function acceptCallback(pending:PendingLogin|null,state:string|null,now=Date.now()){
  if(!pending||!state||pending.state!==state||!Number.isFinite(pending.createdAt)||now-pending.createdAt>10*60*1000||now<pending.createdAt||!/^[A-Za-z0-9_-]{43}$/.test(pending.verifier))throw Error('This sign-in request expired or belongs to another tab. Please start again.');
  // Only restore local board navigation, never a redirect URL or other query parameters.
  const id=new URLSearchParams(pending.returnSearch).get('board');
  return {verifier:pending.verifier,returnSearch:id&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id)?'?board='+encodeURIComponent(id):''};
}
function base64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export async function beginGitHubLogin(config:{clientId:string,redirectUri:string},returnSearch:string){
  const pending:PendingLogin={state:base64url(crypto.getRandomValues(new Uint8Array(32))),verifier:base64url(crypto.getRandomValues(new Uint8Array(32))),createdAt:Date.now(),returnSearch};
  const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pending.verifier))));
  const url=new URL('https://github.com/login/oauth/authorize');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,state:pending.state,code_challenge:challenge,code_challenge_method:'S256',allow_signup:'false'}).toString();
  return {pending,url:url.toString()};
}
