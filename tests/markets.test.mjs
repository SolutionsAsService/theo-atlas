import test from 'node:test';
import assert from 'node:assert/strict';
import {TOKEN,POOLS,GT,MX,number,parsePool,parseMexc,parseCandles,dedupe} from '../markets.mjs';
import {createFeed} from '../feeds.mjs';
import {createServer} from '../server.mjs';
const poolRaw=(pool,{quote=false,wrong=false}={})=>({attributes:{address:pool.address,name:pool.pair,base_token_price_usd:'0.1',quote_token_price_usd:'0.2',reserve_in_usd:'1000',volume_usd:{h24:'250'},price_change_percentage:{h24:'4'}},relationships:{[quote?'quote_token':'base_token']:{data:{id:`${pool.network}_${wrong?'0xwrong':TOKEN.contracts.find(c=>c.network===pool.network).address}`}},dex:{data:{id:'example'}}}});
const ticker={symbol:'THEOUSDT',lastPrice:'0.11',openPrice:'0.1',quoteVolume:'1250',priceChangePercent:'0.1'};
const book={bids:[['0.099','100'],['0.09','1000']],asks:[['0.101','200'],['0.12','1000']]};
const info={symbols:[{symbol:'THEOUSDT',baseAsset:'THEO',quoteAsset:'USDT',fullName:'Autheo'}]};
test('missing, nonfinite and negative inputs do not become fabricated values',()=>{
  for(const value of [null,undefined,'','  ',[],{},true,'oops','Infinity'])assert.equal(number(value),null);
  const raw=poolRaw(POOLS[0]);raw.attributes.reserve_in_usd=null;raw.attributes.volume_usd.h24='-1';
  const m=parsePool(raw,'base','now');assert.equal(m.liquidityUsd,null);assert.equal(m.volume24hUsd,null);
});
test('pool identity is contract-matched, including quote-side THEO',()=>{
  assert.throws(()=>parsePool(poolRaw(POOLS[0],{wrong:true}),'base','now'),/verified THEO/);
  const m=parsePool(poolRaw(POOLS[0],{quote:true}),'base','now');assert.equal(m.priceUsd,.2);assert.equal(m.change24h,null);
});
test('MEXC uses USDT, recomputes percent and bounds depth on both sides',()=>{
  const m=parseMexc(ticker,book,info,'now');assert.ok(Math.abs(m.change24h-10)<1e-8);
  assert.equal(m.priceUsd,null);assert.equal(m.volume24hUsd,null);assert.equal(m.quoteCurrency,'USDT');
  assert.equal(m.bidDepth,9.9);assert.ok(Math.abs(m.askDepth-20.2)<1e-8);assert.ok(Math.abs(m.spreadPct-2)<1e-8);
  assert.throws(()=>parseMexc(ticker,book,{symbols:[]},'now'),/identity/);
  assert.throws(()=>parseMexc(ticker,{bids:[['2','1']],asks:[['1','1']]},info,'now'),/Crossed/);
});
test('history deduplicates and sorts timestamps; pools deduplicate by chain/address key',()=>{
  assert.deepEqual(parseCandles([[2,0,0,0,3],[1,0,0,0,2],[2,0,0,0,4]],{seconds:true}),[{time:1000,price:2},{time:2000,price:4}]);
  assert.equal(dedupe([{id:'base:a'},{id:'base:a'},{id:'robinhood:a'}]).length,2);
});
function fakeFetch(fail=()=>false,counter=()=>{}) {return async url=>{
  counter();if(fail(url))throw new Error('Simulated HTTP 503');
  if(url.includes('/ticker/'))return ticker;if(url.includes('/depth?'))return book;
  if(url.includes('/exchangeInfo'))return info;if(url.includes('/klines'))return [[1,0,0,0,.1]];
  const network=url.includes('/networks/base/')?'base':'robinhood';
  return {data:POOLS.filter(p=>p.network===network).map(p=>poolRaw(p))};
};}
test('concurrent requests coalesce; cache avoids duplicate provider requests',async()=>{
  let calls=0;const feed=createFeed({fetchJson:fakeFetch(()=>false,()=>calls++),now:()=>10000});
  const [a,b]=await Promise.all([feed.snapshot(),feed.snapshot()]);assert.equal(a,b);assert.equal(calls,6);
  await feed.snapshot();assert.equal(calls,6);assert.equal(a.markets.length,4);assert.ok(a.sources.every(s=>s.status==='live'));
});
test('failed feed preserves old timestamp as stale while other sources stay live',async()=>{
  let time=10000,fail=false;const feed=createFeed({fetchJson:fakeFetch(url=>fail&&url.startsWith(MX)),now:()=>time,ttl:100});
  const first=await feed.snapshot();time+=200;fail=true;const second=await feed.snapshot();
  const m=second.markets.find(m=>m.kind==='cex');assert.equal(m.status,'stale');assert.equal(m.updatedAt,first.markets[0].updatedAt);
  assert.equal(second.sources.find(s=>s.id==='base').status,'live');
});
test('initial failure is unavailable with null values, not zero or fake live',async()=>{
  const feed=createFeed({fetchJson:async()=>{throw new Error('offline');}});const s=await feed.snapshot();
  assert.equal(s.markets.length,4);assert.ok(s.markets.every(m=>m.status==='unavailable'&&m.priceUsd===null&&m.priceQuote===null));
});
test('discovery and chart failures do not erase working official feeds',async()=>{
  const feed=createFeed({fetchJson:fakeFetch(url=>url.includes('/tokens/')||url.includes('/klines'))});
  const s=await feed.snapshot();assert.ok(s.sources.every(s=>s.status==='live'));assert.equal(s.markets.length,4);
  assert.equal(s.markets[0].historyStatus,'unavailable');assert.ok(s.sources.every(s=>s.partial));assert.match(s.sources[1].message,/discovery unavailable/);
});
test('HTTP server only serves allowlisted static files and read-only API',async()=>{
  const server=createServer({snapshot:async()=>({markets:[]})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const root=`http://127.0.0.1:${server.address().port}`;
    const api=await fetch(root+'/api/markets');assert.equal(api.status,200);assert.deepEqual(await api.json(),{markets:[]});
    assert.equal((await fetch(root+'/markets.mjs')).status,404);
    assert.equal((await fetch(root+'/api/markets',{method:'POST'})).status,405);
    assert.match(api.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }finally{await new Promise(r=>server.close(r));}
});

test('32-byte pool identifiers remain discoverable but not official',()=>{
  const raw=poolRaw(POOLS[1]);raw.attributes.address='0x'+'c7'.repeat(32);
  const m=parsePool(raw,'robinhood','now');assert.equal(m.verified,false);assert.equal(m.priceUsd,.1);
});
test('zero-sized orders cannot set the best bid',()=>{
  const m=parseMexc(ticker,{bids:[['0.10','0'],['0.09','100']],asks:[['0.101','100']]},info,'now');
  assert.equal(m.book.bids[0][0],.09);assert.ok(m.spreadPct>11);
});
test('stale or future source ticker timestamps are not called live',async()=>{
  for(const time of [1,1_100_000]) {
    const original=fakeFetch();const feed=createFeed({now:()=>1_000_000,fetchJson:async url=>{
      const result=await original(url);return url.includes('/ticker/')?{...result,closeTime:time}:result;
    }});
    const s=await feed.snapshot();assert.equal(s.sources.find(s=>s.id==='mexc').status,'unavailable');
  }
});

test('new listings label launch-period change instead of a full-day move',()=>{
 const opened=1_790_859_600_000;const identity={symbols:[{...info.symbols[0],firstOpenTime:opened}]};
 assert.equal(parseMexc(ticker,book,identity,new Date(opened+3_600_000).toISOString()).changeLabel,'Since listing');
 assert.equal(parseMexc(ticker,book,identity,new Date(opened+100_000_000).toISOString()).changeLabel,'24h');
});

test('last observations survive restart but become stale when providers fail',async()=>{
 const seed=await createFeed({fetchJson:fakeFetch()}).snapshot();let saved=null;
 const feed=createFeed({seed,fetchJson:async()=>{throw new Error('offline');},onSnapshot:s=>{saved=s;}});
 const result=await feed.snapshot();assert.equal(saved,result);assert.ok(result.markets.every(m=>m.status==='stale'));
 assert.equal(result.markets[0].updatedAt,seed.markets[0].updatedAt);
});
test('rate limits do not immediately trigger another request to the same DEX provider',async()=>{
 let calls=0;const feed=createFeed({fetchJson:async url=>{if(url.startsWith(GT)){calls++;throw new Error('Provider returned HTTP 429');}return fakeFetch()(url);}});
 await feed.snapshot();assert.equal(calls,2);
});
