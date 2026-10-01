import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createFeed} from './feeds.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const snapshotPath=path.join(root,'.work','last-snapshot.json');
let seed=null;
try{seed=JSON.parse(readFileSync(snapshotPath,'utf8'));}catch{/* A first run or corrupt cache starts without historical values. */}
const feed=createFeed({seed,onSnapshot:async snapshot=>{
  await mkdir(path.dirname(snapshotPath),{recursive:true});
  await writeFile(snapshotPath+'.tmp',JSON.stringify(snapshot));
  await rename(snapshotPath+'.tmp',snapshotPath);
}});
const assets=new Map([['/',['index.html','text/html']],['/index.html',['index.html','text/html']],['/styles.css',['styles.css','text/css']],['/app.js',['app.js','text/javascript']]]);
export function createServer(provider=feed) {
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/markets') {
        const snapshot=await provider.snapshot();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
        res.end(req.method==='HEAD'?undefined:JSON.stringify(snapshot));return;
      }
      if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
      const asset=assets.get(url.pathname);
      if(!asset){res.writeHead(404);res.end('Not found');return;}
      const contents=await readFile(path.join(root,'public',asset[0]));
      res.writeHead(200,{'Content-Type':`${asset[1]}; charset=utf-8`});res.end(req.method==='HEAD'?undefined:contents);
    }catch(error){console.error(error.message);res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Data temporarily unavailable. Please retry.'}));}
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4317);
  createServer().listen(port,'127.0.0.1',()=>console.log(`THEO Atlas: http://localhost:${port} (read-only, local access)`));
}
