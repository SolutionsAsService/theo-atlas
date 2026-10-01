export const TOKEN = {
  name: 'Autheo', symbol: 'THEO', officialUrl: 'https://www.autheo.com/token-launch',
  contracts: [
    {network: 'base', address: '0xebe516a20238f79dc20b07ead6768e08891ed309'},
    {network: 'robinhood', address: '0x3dc751e0da01812e6d9143cc696e7f07ea94da48'},
  ],
};
export const POOLS = [
  {network:'base', address:'0x182be47742b81777055d69c50e5c9d2fe803e938', name:'Hydrex', pair:'THEO / USDC'},
  {network:'robinhood', address:'0x0d4e669abda39aeab06194ae54034fd2de36f6d5', name:'Uniswap v3', pair:'THEO / USDG'},
  {network:'robinhood', address:'0x5f43e3c666c5f17c9b1a4e261265eb4db41d6a93', name:'Uniswap v3', pair:'THEO / NVDA'},
];
export const GT = 'https://api.geckoterminal.com/api/v2';
export const MX = 'https://api.mexc.com/api/v3';
export function number(value) {
  if (!['number','string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function nonnegative(value) { const n=number(value); return n !== null && n >= 0 ? n : null; }
export function positive(value) { const n=number(value); return n !== null && n > 0 ? n : null; }
export function blankMarket(meta) {
  return {priceUsd:null,priceQuote:null,change24h:null,volume24hUsd:null,volume24hQuote:null,
    liquidityUsd:null,bidDepth:null,askDepth:null,spreadPct:null,book:null,history:[],updatedAt:null,
    status:'unavailable',verified:true,...meta};
}
export function poolMeta(pool) {
  return {id:`${pool.network}:${pool.address.toLowerCase()}`,kind:'dex',network:pool.network,
    name:pool.name,pair:pool.pair,url:`https://www.geckoterminal.com/${pool.network}/pools/${pool.address}`,
    sourceUrl:`${GT}/networks/${pool.network}/pools/${pool.address}`,quoteCurrency:'USD'};
}
export const MEXC_META={id:'mexc:THEOUSDT',kind:'cex',network:'MEXC',name:'MEXC',pair:'THEO / USDT',
  url:'https://www.mexc.com/exchange/THEO_USDT',sourceUrl:`${MX}/ticker/24hr?symbol=THEOUSDT`,quoteCurrency:'USDT'};
export function parsePool(raw,network,updatedAt) {
  const attr=raw?.attributes, contract=TOKEN.contracts.find(c=>c.network===network)?.address;
  if (!attr || !contract || !/^0x(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(attr.address || '')) throw new Error('Invalid pool payload');
  const base=raw.relationships?.base_token?.data?.id?.toLowerCase();
  const quote=raw.relationships?.quote_token?.data?.id?.toLowerCase();
  const target=`${network}_${contract}`;
  if (base !== target && quote !== target) throw new Error('Pool does not contain the verified THEO contract');
  const official=POOLS.find(p=>p.network===network && p.address===attr.address.toLowerCase());
  const dex=raw.relationships?.dex?.data?.id || 'Unknown DEX';
  const meta=poolMeta(official || {network,address:attr.address,name:dex,pair:attr.name || 'Unknown pair'});
  return {...blankMarket(meta),verified:!!official,status:'live',updatedAt,
    priceUsd:positive(base===target?attr.base_token_price_usd:attr.quote_token_price_usd),
    // The provider's pool change is base-token oriented; don't assign it to a quote-side THEO.
    change24h:base===target?number(attr.price_change_percentage?.h24):null,
    volume24hUsd:nonnegative(attr.volume_usd?.h24),liquidityUsd:nonnegative(attr.reserve_in_usd),
    note:official?'Pool reserves include both assets; not executable depth.':'Discovered pool, not in Autheo’s official market list. Excluded from headline totals.',
    provider:'GeckoTerminal',providerUpdatedAt:null};
}
function levels(rows,descending) {
  if (!Array.isArray(rows)) throw new Error('Missing order-book side');
  return rows.map(r=>[positive(r[0]),positive(r[1])]).filter(r=>r[0]!==null && r[1]!==null)
    .sort((a,b)=>descending?b[0]-a[0]:a[0]-b[0]);
}
export function parseMexc(ticker,depth,info,updatedAt) {
  const symbol=info?.symbols?.find(s=>s.symbol==='THEOUSDT');
  if (symbol?.fullName?.toLowerCase()!=='autheo' || symbol?.baseAsset!=='THEO' || symbol?.quoteAsset!=='USDT') throw new Error('MEXC asset identity failed');
  if (ticker?.symbol!=='THEOUSDT' || positive(ticker.lastPrice)===null) throw new Error('Invalid MEXC ticker');
  const bids=levels(depth?.bids,true),asks=levels(depth?.asks,false);
  const last=positive(ticker.lastPrice),open=positive(ticker.openPrice);
  const bid=bids[0]?.[0],ask=asks[0]?.[0];
  if(bid && ask && bid>ask) throw new Error('Crossed MEXC order book');
  const mid=bid && ask ? (bid+ask)/2:null;
  const result={...blankMarket(MEXC_META),status:'live',updatedAt,priceQuote:last,
    change24h:open ? (last/open-1)*100:null,
    changeLabel:positive(symbol.firstOpenTime) && Date.parse(updatedAt)-Number(symbol.firstOpenTime)>=0 && Date.parse(updatedAt)-Number(symbol.firstOpenTime)<86_400_000 ? 'Since listing' : '24h',
    volume24hQuote:nonnegative(ticker.quoteVolume),
    bidDepth:mid?bids.filter(([p])=>p>=mid*.98).reduce((s,[p,q])=>s+p*q,0):null,
    askDepth:mid?asks.filter(([p])=>p<=mid*1.02).reduce((s,[p,q])=>s+p*q,0):null,
    spreadPct:mid?(ask-bid)/mid*100:null,book:{bids,asks},provider:'MEXC',
    note:'USDT units. Depth is displayed orders within ±2% of midpoint (up to 1,000 levels per side), not exchange balances or DEX TVL. Change is calculated from the reported open; new listings may have less than 24h history.',
    providerUpdatedAt:number(depth.timestamp)===null?null:new Date(Number(depth.timestamp)).toISOString(),
    tickerUpdatedAt:number(ticker.closeTime)===null?null:new Date(Number(ticker.closeTime)).toISOString(),
    depthTruncated:!!mid && ((bids.length>=1000 && bids.at(-1)[0]>=mid*.98)||(asks.length>=1000 && asks.at(-1)[0]<=mid*1.02))};
  if(result.depthTruncated) result.note+=' Depth is a lower bound: the requested book limit was reached inside the band.';
  return result;
}
export function parseCandles(rows,{seconds=false,closeIndex=4}={}) {
  if(!Array.isArray(rows)) return [];
  const result=new Map();
  for(const row of rows) { const time=positive(row?.[0]),price=positive(row?.[closeIndex]);
    if(time!==null && price!==null) result.set(time*(seconds?1000:1),price); }
  return [...result].sort((a,b)=>a[0]-b[0]).map(([time,price])=>({time,price}));
}
export function dedupe(markets) { return [...new Map(markets.map(m=>[m.id,m])).values()]; }
