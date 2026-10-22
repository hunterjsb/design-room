import {HttpError} from './model';
import {githubIdentity,type Identity} from './auth';
export type OAuthConfig={clientId:string,clientSecret:string,redirectUri:string};
export async function exchangeGitHubCode(input:unknown,config:OAuthConfig,repository:string,request:typeof fetch=fetch):Promise<Identity>{
  if(!config.clientId||!config.clientSecret||!config.redirectUri)throw new HttpError(503,'GitHub sign-in needs one-time administrator setup.');
  const value=input as {code?:unknown,verifier?:unknown};
  if(!value||typeof value.code!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(value.code)||typeof value.verifier!=='string'||!/^[a-zA-Z0-9._~-]{43,128}$/.test(value.verifier))throw new HttpError(400,'This sign-in request is invalid. Start again.');
  const response=await request('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'design-room'},body:JSON.stringify({client_id:config.clientId,client_secret:config.clientSecret,code:value.code,redirect_uri:config.redirectUri,code_verifier:value.verifier}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new HttpError(502,'GitHub sign-in is temporarily unavailable. Try again.');
  const data=await response.json() as {access_token?:unknown};
  if(typeof data.access_token!=='string')throw new HttpError(401,'This GitHub sign-in expired or was already used. Start again.');
  // Verify identity AND current repository membership before issuing any app session.
  // Neither the user access token nor refresh token is persisted.
  return githubIdentity(data.access_token,repository,request,'app');
}
