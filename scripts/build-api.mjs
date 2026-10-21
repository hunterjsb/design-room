import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('build/api',{recursive:true});
await build({entryPoints:['api/handler.ts'],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:'build/api/index.cjs',sourcemap:false,minify:true});
console.log('API bundle ready.');
