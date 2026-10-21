import {readFileSync,writeFileSync} from 'node:fs';
const siteUrl=process.argv[2];if(!siteUrl)throw Error('Supply the public site URL.');
const {apiUrl}=JSON.parse(readFileSync('work/infra-outputs.json','utf8'));
writeFileSync('workspace.config.json',JSON.stringify({apiUrl,siteUrl},null,2)+'\n');
writeFileSync('.env.local','VITE_API_URL='+apiUrl+'\n');
