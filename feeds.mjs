import {TOKEN,POOLS,GT,MX,MEXC_META,blankMarket,poolMeta,parsePool,parseMexc,parseCandles,dedupe,number} from './markets.mjs';
const PERIOD=60_000;
export async function requestJson(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'THEO-Observatory/0.1 public-market-reader'}});
  if(!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json();
}
export function createFeed({fetchJson=requestJson,now=()=>Date.now(),ttl=PERIOD,seed=null,onSnapshot=()=>{}}={}) {
  let cached=null,inflight=null,expires=0;
  const previous=new Map();
  for(const id of ['mexc','base','robinhood']) {
    const saved=(Array.isArray(seed?.markets)?seed.markets:[]).filter(m=>m.updatedAt && ['live','stale'].includes(m.status) && (id==='mexc'?m.id===MEXC_META.id:m.kind==='dex' && m.network===id));
    if(saved.length) previous.set(id,saved);
  }
  async function mexc() {
    const [ticker,depth,info,candles]=await Promise.all([
      fetchJson(`${MX}/ticker/24hr?symbol=THEOUSDT`),fetchJson(`${MX}/depth?symbol=THEOUSDT&limit=1000`),
      fetchJson(`${MX}/exchangeInfo?symbol=THEOUSDT`),fetchJson(`${MX}/klines?symbol=THEOUSDT&interval=60m&limit=48`).catch(()=>null)]);
    for(const [label,raw] of [['Order-book',depth.timestamp],['Ticker',ticker.closeTime]]) {
      if(raw === null || raw === undefined) continue;
      const time=number(raw);
      if(time===null || time<=0 || now()-time>300_000 || time-now()>60_000) throw new Error(`${label} timestamp is invalid, stale or in the future`);
    }
    const market=parseMexc(ticker,depth,info,new Date(now()).toISOString());
    market.history=parseCandles(candles);
    market.historyStatus=candles?'available':'unavailable';
    return {markets:[market],partial:!candles,message:candles?'Ticker, book and hourly candles received.':'Ticker and book received; chart unavailable.'};
  }
  async function dex(network) {
    const pools=POOLS.filter(p=>p.network===network),contract=TOKEN.contracts.find(c=>c.network===network).address;
    const url=`${GT}/networks/${network}/pools/multi/${pools.map(p=>p.address).join(',')}`;
    let discovery=null,discoveryError=null;
    try {discovery=await fetchJson(`${GT}/networks/${network}/tokens/${contract}/pools?page=1`);}
    catch(error) {discoveryError=error;}
    if(discoveryError?.message.includes('429')) throw discoveryError;
    // One contract-discovery request usually contains every official pool. Only
    // request the explicit official set when first-page coverage is incomplete.
    const complete=Array.isArray(discovery?.data) && pools.every(p=>discovery.data.some(v=>v.attributes?.address?.toLowerCase()===p.address));
    const verified=complete?discovery:await fetchJson(url);
    if(!Array.isArray(verified?.data)) throw new Error('Invalid pool-list payload');
    const updatedAt=new Date(now()).toISOString();
    const official=pools.map(p=>{
      const raw=verified.data.find(v=>v.attributes?.address?.toLowerCase()===p.address);
      if(!raw) throw new Error(`Official ${p.pair} pool missing from provider`);
      return parsePool(raw,network,updatedAt);
    });
    const other=(Array.isArray(discovery?.data)?discovery.data:[]).flatMap(raw=>{
      try{return [parsePool(raw,network,updatedAt)];}catch{return [];}
    }).filter(m=>!m.verified);
    return {markets:dedupe([...official,...other]),partial:!discovery,message:discovery?
      'Official pools plus first-page contract-matched discovery. Not an exhaustive market census.':
      'Official pools received; additional-pool discovery unavailable.'};
  }
  async function refresh() {
    const specs=[{id:'mexc',get:mexc,empty:[blankMarket(MEXC_META)]},
      ...TOKEN.contracts.map(({network})=>({id:network,get:()=>dex(network),empty:POOLS.filter(p=>p.network===network).map(p=>blankMarket(poolMeta(p)))}))];
    const results=await Promise.all(specs.map(async spec=>{
      try {
        const result=await spec.get();previous.set(spec.id,result.markets);
        return {...result,source:{id:spec.id,status:'live',partial:result.partial,message:result.message}};
      } catch(error) {
        const older=previous.get(spec.id);
        const markets=(older || spec.empty).map(m=>({...m,status:older?'stale':'unavailable',note:`${error.message}. ${m.note||''}`}));
        return {markets,source:{id:spec.id,status:older?'stale':'unavailable',message:error.message}};
      }
    }));
    cached={updatedAt:new Date(now()).toISOString(),refreshSeconds:60,token:TOKEN,
      markets:dedupe(results.flatMap(r=>r.markets)),sources:results.map(r=>r.source)};
    try{await onSnapshot(cached);}catch(error){console.error('Local snapshot save failed:',error.message);}
    expires=now()+ttl;
    return cached;
  }
  return { async snapshot() {
    if(cached && now()<expires)return cached;
    if(!inflight)inflight=refresh().finally(()=>{inflight=null;});
    return inflight;
  }};
}
