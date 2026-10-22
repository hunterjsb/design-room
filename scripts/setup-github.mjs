// One-time GitHub App registration. Credentials stay in memory and encrypted Pulumi config.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {siteUrl,apiUrl}=JSON.parse(readFileSync(new URL('../workspace.config.json',import.meta.url),'utf8'));
const port=8766,host='127.0.0.1:'+port,state=randomBytes(32).toString('base64url'),local='http://'+host;
const manifest={name:new URL(siteUrl).hostname.split('.')[0]+'-design-room',url:siteUrl,description:'Private collaborative boards. Verifies approved repository membership with read-only metadata access.',hook_attributes:{url:apiUrl+'/api/health',active:false},redirect_url:local+'/callback',callback_urls:[siteUrl],public:true,default_permissions:{metadata:'read'},default_events:[],request_oauth_on_install:false};
const escape=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function page(res,body,status=200){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'"});res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Design Room sign-in setup</title><style>body{font:16px system-ui;background:#e7e7dc;color:#29362f;max-width:620px;margin:8vh auto;padding:24px}button{padding:14px 20px;font:inherit;cursor:pointer}p{line-height:1.6}a{color:#345d4d}</style>'+body)}
function run(args,input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/infra.mjs',...args],{stdio:['pipe','pipe','pipe']});let error='';child.stderr.on('data',chunk=>{error+=chunk.toString()});child.stdout.resume();child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Pulumi configuration or deployment failed. Credentials were not printed. Run npm run infra -- up --yes to retry from local encrypted configuration; do not register another app.')));child.stdin.end(input);})}
let processing=false;
const timer=setTimeout(()=>{server.close();console.log('Registration link expired. Run npm run setup:github again.');},30*60*1000);
const server=createServer(async(req,res)=>{
  if(req.headers.host!==host||req.method!=='GET'){page(res,'<h1>Not allowed</h1>',403);return}
  const url=new URL(req.url,local);
  if(url.pathname==='/setup/'+state){page(res,'<h1>Enable GitHub sign-in</h1><p>Create a GitHub App owned by your account. It requests <b>read-only repository metadata</b> to check membership; it cannot read or change repository code.</p><p>After registration, install it on the repository that controls workspace membership. Other approved members can then sign in through GitHub.</p><form method="post" action="https://github.com/settings/apps/new?state='+state+'"><input type="hidden" name="manifest" value="'+escape(JSON.stringify(manifest))+'"><button>Review registration on GitHub</button></form>');return}
  if(url.pathname!=='/callback'||url.searchParams.get('state')!==state||processing){page(res,'<h1>Invalid or already-used setup link</h1>',400);return}
  const code=url.searchParams.get('code');if(!code||!/^[A-Za-z0-9_-]{1,200}$/.test(code)){page(res,'<h1>GitHub did not return a registration code</h1>',400);return}
  processing=true;
  try{
    const r=await fetch('https://api.github.com/app-manifests/'+encodeURIComponent(code)+'/conversions',{method:'POST',headers:{Accept:'application/vnd.github+json','User-Agent':'design-room','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('GitHub could not complete app registration.');
    const app=await r.json();if(typeof app.client_id!=='string'||typeof app.client_secret!=='string'||typeof app.slug!=='string')throw Error('GitHub returned incomplete app settings.');
    await run(['config','set','githubClientId',app.client_id]);
    await run(['config','set','--secret','githubClientSecret'],app.client_secret+'\n');
    await run(['config','set','githubRedirectUri',siteUrl]);
    const install='https://github.com/apps/'+encodeURIComponent(app.slug)+'/installations/new';
    console.log('GitHub App registered; credentials saved in encrypted Pulumi configuration. Deploying sign-in settings…');console.log('Install on the membership repository after deployment: '+install);
    // App private key and webhook secret are unnecessary for this identity-only flow and are discarded.
    await run(['up','--yes','--non-interactive']);
    page(res,'<h1>GitHub sign-in is configured</h1><p>Finish by installing the app on <b>only the repository that controls workspace membership</b>.</p><p><a href="'+install+'">Install GitHub App</a></p><p>Then return to <a href="'+escape(siteUrl)+'">Design Room</a> and choose <b>Sign in with GitHub</b>.</p>');
    console.log('Redirect sign-in deployed. Install the app on the membership repository: '+install);
    clearTimeout(timer);server.close();
  }catch(e){page(res,'<h1>Setup could not finish</h1><p>Check the local terminal. No credentials were displayed.</p>',500);console.error(e.message);clearTimeout(timer);server.close();process.exitCode=1}
});
server.on('error',()=>{clearTimeout(timer);console.error('Cannot start setup on '+local+'. Another setup process may already be running.');process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log('One-time GitHub App registration: '+local+'/setup/'+state));
