import {mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=fileURLToPath(new URL('review-relay.mjs',import.meta.url)),directory=resolve(homedir(),'.config/systemd/user');
const quote=s=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%')+'"';
mkdirSync(directory,{recursive:true});
writeFileSync(resolve(directory,'design-room-review-relay.service'),`[Unit]\nDescription=Design Room explicit questionnaire submissions\nAfter=network-online.target desert-bridge.service\n\n[Service]\nType=simple\nExecStart=${quote(process.execPath)} ${quote(source)}\nEnvironment=${quote('PATH='+process.env.PATH)}\nRestart=on-failure\nRestartSec=30\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`,{mode:0o600});
for(const args of [['--user','daemon-reload'],['--user','enable','--now','design-room-review-relay.service']]){const r=spawnSync('systemctl',args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
console.log('Questionnaire delivery service enabled. It delivers only explicit submissions; drafts never enter the queue.');
