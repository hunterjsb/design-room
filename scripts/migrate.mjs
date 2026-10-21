// Run locally with private exports. This script never embeds workspace content in source.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,PutCommand} from '@aws-sdk/lib-dynamodb';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
const [backup,source,title]=process.argv.slice(2);
const {tableName:table,bucketName:bucket,awsRegion:region}=JSON.parse(readFileSync('work/infra-outputs.json','utf8'));
if(!backup||!source||!title)throw Error('Usage: node scripts/migrate.mjs PRIVATE_BACKUP OLD_SOURCE WORKSPACE_TITLE');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({region})),s3=new S3Client({region});
if((await db.send(new GetCommand({TableName:table,Key:{pk:'CATALOG'}}))).Item)throw Error('A catalog already exists. Refusing to replace live data.');
const parse=p=>JSON.parse(readFileSync(p,'utf8'));
async function put(key,body,type){await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:type,ServerSideEncryption:'AES256'}))}
const catalog=parse(join(backup,'catalog.json'));
for(const info of catalog.boards){const value=parse(join(backup,info.id+'.json')),dataKey='boards/'+info.id+'/migration.json';await put(dataKey,JSON.stringify(value.board),'application/json');await db.send(new PutCommand({TableName:table,Item:{pk:'BOARD#'+info.id,dataKey,revision:value.revision,updatedAt:value.updatedAt,updatedBy:value.updatedBy},ConditionExpression:'attribute_not_exists(pk)'}));console.log('Migrated board '+info.id+': '+value.board.nodes.length+' nodes, '+value.board.edges.length+' edges.');}
const docs=parse(join(source,'lib/docs-index.json'));await put('documents/index.json',JSON.stringify(docs),'application/json');for(const doc of docs)await put('documents/'+doc.path,readFileSync(join(source,'public/repo-docs',doc.path)),'text/plain; charset=utf-8');
async function assets(dir,prefix){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name),key=prefix+'/'+entry.name;if(entry.isDirectory())await assets(path,key);else{const type=entry.name.endsWith('.png')?'image/png':entry.name.endsWith('.pdf')?'application/pdf':'application/octet-stream';await put(key,readFileSync(path),type)}}}
await assets(join(source,'public/imports'),'imports');
await db.send(new PutCommand({TableName:table,Item:{pk:'CONFIG',workspace:{title}},ConditionExpression:'attribute_not_exists(pk)'}));
await db.send(new PutCommand({TableName:table,Item:{pk:'CATALOG',...catalog,activeIds:catalog.boards.filter(b=>!b.deleted).map(b=>b.id)},ConditionExpression:'attribute_not_exists(pk)'}));
console.log('Private workspace migration complete: '+catalog.boards.length+' boards and '+docs.length+' repository documents.');
