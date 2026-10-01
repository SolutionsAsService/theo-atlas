'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const STALE_MS = 120_000;
  const state = { snapshot: null, filter: 'all', query: '', busy: false, failed: false, timer: null };
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const text = (id, value) => { $(id).textContent = value; };
  const number = (value, digits = 2) => finite(value)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value) : '—';
  const compact = (value) => finite(value)
    ? new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(value) : '—';
  const price = (value, usd = true) => finite(value)
    ? `${usd ? '$' : ''}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: value < .001 ? 8 : 5 }).format(value)}` : '—';
  const cash = (value) => finite(value) ? `$${compact(value)}` : '—';
  const percentage = (value) => finite(value) ? `${value > 0 ? '+' : ''}${number(value)}%` : '—';
  const nameCase = (value) => ({ base: 'Base', robinhood: 'Robinhood', mexc: 'MEXC' }[String(value).toLowerCase()] || String(value || 'Unknown'));
  const dateValue = (value) => typeof value === 'number' ? value : Date.parse(value);
  const timeLabel = (value) => Number.isFinite(dateValue(value))
    ? new Date(dateValue(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unknown time';
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function safeUrl(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }
  function statusFor(market) {
    if (market.status !== 'live') return market.status === 'stale' ? 'stale' : 'unavailable';
    const timestamp = dateValue(market.updatedAt || state.snapshot?.updatedAt);
    if (state.failed || !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_MS) return 'stale';
    return 'live';
  }
  function uniqueMarkets() {
    return [...new Map((state.snapshot?.markets || []).filter((m) => m && typeof m.id === 'string').map((m) => [m.id.toLowerCase(), m])).values()];
  }
  function badge(id, value) {
    const node = $(id);
    node.hidden = !finite(value);
    node.textContent = finite(value) ? percentage(value) : '';
    node.className = `change${value < 0 ? ' negative' : ''}`;
  }
  function sumPresent(markets, field) {
    const values = markets.map((m) => m[field]).filter(finite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  function renderSummary(markets) {
    const live = markets.filter((m) => statusFor(m) === 'live');
    const dex = live.filter((m) => m.kind === 'dex' && m.verified === true);
    const reference = dex.filter((m) => finite(m.priceUsd) && finite(m.liquidityUsd))
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0];
    text('reference-price', price(reference?.priceUsd));
    text('reference-source', reference ? `${reference.name} · ${nameCase(reference.network)} · USD` : 'No live, verified DEX price available');
    badge('price-change', reference?.change24h);
    text('liquidity', cash(sumPresent(dex, 'liquidityUsd')));
    const liquidityCount = dex.filter((m) => finite(m.liquidityUsd)).length;
    text('liquidity-detail', liquidityCount ? `${liquidityCount}/${markets.filter(m=>m.kind==='dex' && m.verified===true).length} verified pools · both assets` : 'No live, verified liquidity available');
    text('volume', cash(sumPresent(dex, 'volume24hUsd')));
    text('volume-detail', dex.length ? `${dex.filter(m=>finite(m.volume24hUsd)).length}/${markets.filter(m=>m.kind==='dex' && m.verified===true).length} pools reporting · excludes MEXC` : 'No live, verified DEX volume available');
    text('market-count', markets.length ? String(live.length) : '—');
    text('market-total', markets.length ? `/ ${markets.length}` : '');
    const networks = new Set(markets.filter((m) => m.kind === 'dex').map((m) => m.network));
    text('network-count', markets.length ? `${networks.size} networks · ${markets.filter((m) => m.kind === 'cex').length} centralized exchange` : 'No markets returned by sources');
    const failedSources = (state.snapshot?.sources || []).filter((s) => s.status !== 'live' || s.partial === true);
    const status = $('overall-status');
    const allLive = markets.length > 0 && live.length === markets.length && failedSources.length === 0 && !state.failed;
    status.replaceChildren(element('span', `status-dot ${allLive ? '' : live.length ? 'partial' : 'unavailable'}`),
      document.createTextNode(allLive ? 'All tracked markets reporting' : live.length ? `Partial coverage · ${live.length} of ${markets.length} markets reporting` : 'No fresh market data · values excluded from totals'));
    text('last-updated', `Fetched ${timeLabel(state.snapshot?.updatedAt)} · auto-refresh ${refreshSeconds()}s`);
    $('last-updated').title = state.snapshot?.updatedAt || '';
  }
  function renderDepth(markets) {
    const source = markets.find((m) => m.kind === 'cex' && /mexc/i.test(`${m.id} ${m.name}`));
    const market = source && statusFor(source) === 'live' ? source : null;
    const bids = finite(market?.bidDepth) ? market.bidDepth : null;
    const asks = finite(market?.askDepth) ? market.askDepth : null;
    const total = finite(bids) && finite(asks) ? bids + asks : null;
    text('depth-total', compact(total));
    text('bid-depth', finite(bids) ? `${compact(bids)} USDT` : '—');
    text('ask-depth', finite(asks) ? `${compact(asks)} USDT` : '—');
    text('spread', finite(market?.spreadPct) ? `${number(market.spreadPct, 3)}%` : '—');
    text('cex-volume', finite(market?.volume24hQuote) ? `${compact(market.volume24hQuote)} USDT` : '—');
    $('bid-bar').style.width = total > 0 ? `${(bids / total) * 100}%` : '0%';
    $('ask-bar').style.width = total > 0 ? `${(asks / total) * 100}%` : '0%';
    const description = document.querySelector('.depth-explainer');
    description.textContent = market ? `Resting orders within 2% of the mid-price.${market.depthTruncated ? ' Available levels only; book is truncated.' : ''}` : 'No fresh MEXC order book available.';
    renderChart(source);
  }
  function svgElement(tag, attrs = {}, value) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([name, content]) => node.setAttribute(name, String(content)));
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function renderChart(market) {
    const fresh = market && statusFor(market) === 'live';
    text('chart-price', fresh ? price(market.priceQuote, false) : '—');
    text('chart-subtitle', market?.changeLabel === 'Since listing' ? 'MEXC · THEO / USDT · change since listing' : 'MEXC · THEO / USDT');
    badge('chart-change', fresh ? market.change24h : null);
    $('chart-change').title = 'Calculated change from source-reported opening price; new listings may have less than 24 hours of trading.';
    const data = [...new Map((Array.isArray(market?.history) ? market.history : [])
      .filter((p) => finite(p?.time) && finite(p?.price) && p.price >= 0).map((p) => [p.time, p])).values()].sort((a, b) => a.time - b.time);
    const container = $('price-chart');
    container.replaceChildren();
    if (data.length < 2) {
      const empty = element('div', 'chart-empty');
      empty.append(element('span', '', '⌁'), element('p', '', 'History is not available yet.'), element('small', '', 'We only chart actual observations.'));
      container.append(empty);
      text('chart-range', 'AWAITING HISTORY');
      text('chart-note', 'No simulated data');
      return;
    }
    const width = Math.max(290, container.clientWidth - 34), height = 195;
    const left = 2, right = width - 55, top = 16, bottom = 166;
    const min = Math.min(...data.map((p) => p.price)), max = Math.max(...data.map((p) => p.price));
    const padding = (max - min) * .16 || Math.max(max * .015, .000001);
    const low = Math.max(0, min - padding), high = max + padding;
    const start = data[0].time, end = data.at(-1).time;
    const x = (point) => left + ((point.time - start) / (end - start)) * (right - left);
    const y = (value) => bottom - ((value - low) / (high - low)) * (bottom - top);
    const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `MEXC price history in USDT, ${data.length} observations, ${new Date(start).toLocaleString()} to ${new Date(end).toLocaleString()}. ${fresh ? '' : 'Historical data; current source is not fresh.'}` });
    const defs = svgElement('defs'), gradient = svgElement('linearGradient', { id: 'price-fill', x1: '0', x2: '0', y1: '0', y2: '1' });
    gradient.append(svgElement('stop', { offset: '0%', 'stop-color': '#bbedac', 'stop-opacity': '.16' }), svgElement('stop', { offset: '100%', 'stop-color': '#bbedac', 'stop-opacity': '0' }));
    defs.append(gradient); svg.append(defs);
    for (let i = 0; i < 4; i++) {
      const value = low + (high - low) * i / 3, yy = y(value);
      svg.append(svgElement('line', { x1: left, y1: yy, x2: right, y2: yy, stroke: '#2c3527', 'stroke-dasharray': '3 5' }), svgElement('text', { x: right + 9, y: yy + 3, class: 'chart-axis' }, number(value, 4)));
    }
    const path = data.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(2)},${y(p.price).toFixed(2)}`).join(' ');
    svg.append(svgElement('path', { d: `${path} L${right},${bottom} L${left},${bottom} Z`, fill: 'url(#price-fill)' }), svgElement('path', { d: path, fill: 'none', stroke: '#c0efad', 'stroke-width': '2.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const labels = width < 390 ? [data[0], data.at(-1)] : [data[0], data[Math.floor(data.length / 2)], data.at(-1)];
    labels.forEach((p, i) => {
      const label = new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      svg.append(svgElement('text', { x: x(p), y: 189, class: 'chart-axis', 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }, label));
    });
    data.forEach((p, i) => {
      const point = svgElement('circle', { cx: x(p), cy: y(p.price), r: i === data.length - 1 ? 3.5 : 2, fill: '#c0efad', tabindex: '0', 'aria-label': `${new Date(p.time).toLocaleString()}: ${price(p.price, false)} USDT` });
      point.append(svgElement('title', {}, `${new Date(p.time).toLocaleString()} · ${price(p.price, false)} USDT`));
      svg.append(point);
    });
    container.append(svg);
    const hours = (end - start) / 3_600_000;
    text('chart-range', `${hours < 1 ? Math.round(hours * 60) + ' MIN' : number(hours, hours % 1 ? 1 : 0) + ' HOURS'} AVAILABLE`);
    text('chart-note', `${data.length} actual observations${fresh ? ' · local time' : ' · source stale'}`);
  }
  function renderMarkets(markets) {
    const selected = markets.filter((m) => {
      const haystack = `${m.name} ${m.pair} ${m.network} ${m.id}`.toLowerCase();
      return (state.filter === 'all' || (state.filter === 'mexc' ? /mexc/i.test(`${m.name} ${m.id}`) : String(m.network).toLowerCase() === state.filter)) && haystack.includes(state.query.toLowerCase().trim());
    }).sort((a, b) => Number(b.verified === true) - Number(a.verified === true));
    text('table-count', `${selected.length} ${selected.length === 1 ? 'MARKET' : 'MARKETS'}`);
    const body = $('market-rows');
    body.replaceChildren();
    if (!selected.length) {
      const row = element('tr'), cell = element('td', 'table-empty', markets.length ? 'No markets match this view. Try another network or search.' : 'No market data available. Refresh to try the sources again.');
      cell.colSpan = 8; row.append(cell); body.append(row); return;
    }
    selected.forEach((market) => {
      const status = statusFor(market), row = element('tr');
      row.dataset.marketId = market.id;
      const venue = element('td'), wrapper = element('div', 'venue-cell');
      const color = ['base', 'robinhood'].includes(String(market.network).toLowerCase()) ? String(market.network).toLowerCase() : '';
      const icon = element('span', `venue-icon ${color}`, market.kind === 'cex' ? 'M' : /hydrex/i.test(market.name) ? 'H' : 'U');
      icon.setAttribute('aria-hidden', 'true');
      const description = element('div');
      description.append(element('strong', '', market.name || 'Unknown venue'), element('small', '', market.pair || 'Unknown pair'));
      if (market.verified !== true) description.append(element('small', 'unverified', 'Discovered · unverified'));
      wrapper.append(icon, description); venue.append(wrapper); row.append(venue);
      const network = element('td'); network.append(element('span', 'network-tag', nameCase(market.network))); row.append(network);
      const priceCell = element('td', 'numeric', market.kind === 'cex' ? price(market.priceQuote, false) : price(market.priceUsd));
      priceCell.append(element('small', 'cell-secondary', market.kind === 'cex' ? market.quoteCurrency || 'Quote' : 'USD')); row.append(priceCell);
      const changeCell=element('td', `numeric ${finite(market.change24h) ? market.change24h < 0 ? 'negative-text' : 'positive-text' : ''}`, percentage(market.change24h));
      if(market.changeLabel==='Since listing') changeCell.append(element('small','cell-secondary','Since listing'));
      row.append(changeCell);
      const volume = element('td', 'numeric', market.kind === 'cex' ? compact(market.volume24hQuote) : cash(market.volume24hUsd));
      volume.append(element('small', 'cell-secondary', market.kind === 'cex' ? market.quoteCurrency || 'Quote' : 'USD')); row.append(volume);
      const liquidity = element('td', 'numeric', market.kind === 'dex' ? cash(market.liquidityUsd) : '—');
      if (market.kind === 'cex') liquidity.append(element('small', 'cell-secondary', 'Order book above'));
      row.append(liquidity);
      const availability = element('td'), statusBadge = element('span', `market-status ${status}`);
      statusBadge.append(element('span', `status-dot ${status}`), document.createTextNode(status === 'live' ? 'Live' : status === 'stale' ? 'Stale' : 'Unavailable'));
      availability.append(statusBadge, element('small', 'cell-secondary', market.updatedAt ? timeLabel(market.updatedAt) : 'No recent data'));
      availability.title = [market.updatedAt, market.note].filter(Boolean).join('\n'); row.append(availability);
      const linkCell = element('td'), href = safeUrl(market.url);
      if (href) { const link = element('a', 'market-link', '↗'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Open ${market.name} ${market.pair} market (new tab)`); linkCell.append(link); }
      row.append(linkCell); body.append(row);
    });
  }
  function renderSources(markets) {
    const container = $('source-list'); container.replaceChildren();
    const sources = Array.isArray(state.snapshot?.sources) ? state.snapshot.sources : [];
    sources.forEach((source) => {
      const relevant = markets.filter((m) => String(m.network).toLowerCase() === String(source.id).toLowerCase());
      const live = relevant.filter((m) => statusFor(m) === 'live').length;
      const stale = relevant.some((m) => statusFor(m) === 'stale');
      const status = state.failed || stale ? 'stale' : source.status === 'live' && live ? source.partial ? 'partial' : 'live' : 'unavailable';
      const card = element('div', 'source-card'), detail = element('div');
      detail.append(element('strong', '', `${nameCase(source.id)} · ${status === 'live' ? 'Reporting' : status === 'partial' ? 'Partial' : status === 'stale' ? 'Stale' : 'Unavailable'}`), element('p', '', source.message || 'No source detail available.'));
      if (relevant.length) detail.append(element('p', '', `Fetched ${timeLabel(relevant[0].updatedAt)} · ${live}/${relevant.length} markets fresh`));
      const sourceHref=safeUrl(relevant[0]?.sourceUrl);
      if(sourceHref){const link=element('a','source-api-link','View public API ↗');link.href=sourceHref;link.target='_blank';link.rel='noopener noreferrer';detail.append(link);}
      card.append(element('span', `status-dot ${status}`), detail); container.append(card);
    });
    if (!sources.length) { const card = element('div', 'source-card'); card.append(element('span', 'status-dot unavailable'), element('p', '', 'Source status is unavailable.')); container.append(card); }
    const contracts = $('token-contracts'); contracts.replaceChildren();
    (state.snapshot?.token?.contracts || []).forEach((contract) => {
      const line = element('div'); line.append(element('strong', '', `${nameCase(contract.network)} contract: `), element('code', '', contract.address)); contracts.append(line);
    });
  }
  function render() {
    const markets = uniqueMarkets();
    renderSummary(markets); renderDepth(markets); renderMarkets(markets); renderSources(markets);
  }
  function refreshSeconds() { return Math.max(30, Math.min(300, Number(state.snapshot?.refreshSeconds) || 60)); }
  async function refresh() {
    if (state.busy) return;
    state.busy = true;
    const button = $('refresh'); button.disabled = true; button.classList.add('spinning'); button.setAttribute('aria-busy', 'true');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch('/api/markets', { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.markets)) throw new Error('Invalid market response');
      state.snapshot = data; state.failed = false;
      $('error-banner').hidden = true; $('export').disabled = false;
      render();
    } catch {
      state.failed = true;
      const banner = $('error-banner'); banner.hidden = false;
      banner.textContent = state.snapshot ? 'Could not refresh market data. Previous observations are marked stale and excluded from totals. Retrying automatically.' : 'Market sources could not be reached. No values are being estimated. Refresh to retry, or wait for the automatic check.';
      render();
    } finally {
      clearTimeout(timeout); state.busy = false; button.disabled = false; button.classList.remove('spinning'); button.removeAttribute('aria-busy');
      clearTimeout(state.timer); state.timer = setTimeout(refresh, refreshSeconds() * 1000);
    }
  }
  $('refresh').addEventListener('click', refresh);
  $('market-search').addEventListener('input', (event) => { state.query = event.target.value; renderMarkets(uniqueMarkets()); });
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
    renderMarkets(uniqueMarkets());
  }));
  document.querySelectorAll('.nav-item').forEach((link) => link.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === link));
  }));
  $('export').addEventListener('click', () => {
    if (!state.snapshot) return;
    const payload = { ...state.snapshot, exportedAt: new Date().toISOString(), connectionFailed: state.failed, markets: uniqueMarkets().map((m) => ({ ...m, status: statusFor(m) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = element('a'); link.href = url; link.download = `theo-atlas-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.snapshot) renderDepth(uniqueMarkets()); }, 150); });
  setInterval(() => { if (state.snapshot && !state.busy) render(); }, 15_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (state.snapshot) render(); refresh(); } });
  refresh();
})();
