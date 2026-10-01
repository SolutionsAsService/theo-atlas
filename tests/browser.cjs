const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.BASE_URL||'http://127.0.0.1:4317';
const artifacts=path.resolve('.work/artifacts');fs.mkdirSync(artifacts,{recursive:true});
const report={passed:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#market-count').textContent!=='—',{},{timeout:45000});
  const snapshot=await page.evaluate(async()=>await(await fetch('/api/markets')).json());
  assert.ok(snapshot.markets.length>=4);assert.ok(await page.locator('#market-rows tr').count()>=4);
  assert.ok(snapshot.markets.some(m=>m.status==='live'));
  if(snapshot.markets.some(m=>m.kind==='dex' && m.verified && m.status==='live' && m.liquidityUsd!==null))assert.match(await page.locator('#liquidity').innerText(),/\d/);
  else assert.equal((await page.locator('#liquidity').innerText()).trim(),'—');
  report.sourceStatus=snapshot.sources;
  report.passed.push('Public API renders tracked markets and honest live/partial availability');
  await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
  await page.locator('[data-filter="mexc"]').click();assert.equal(await page.locator('#market-rows tr').count(),1);assert.match(await page.locator('#market-rows').innerText(),/MEXC/);
  await page.locator('[data-filter="base"]').click();assert.match(await page.locator('#market-rows').innerText(),/Hydrex/);
  await page.locator('[data-filter="all"]').click();await page.locator('#market-search').fill('no-such-market-xyz');assert.doesNotMatch(await page.locator('#market-rows').innerText(),/Hydrex/);
  await page.locator('#market-search').fill('');report.passed.push('Venue filters and empty search state work');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  const saved=path.join(artifacts,'export.json');await download.saveAs(saved);const exported=JSON.parse(fs.readFileSync(saved));assert.ok(exported.markets.length>=4);report.passed.push('JSON export contains actual market snapshot');
  let refreshCalls=0;page.on('request',r=>{if(r.url().includes('/api/markets'))refreshCalls++;});await page.locator('#refresh').click();await page.waitForTimeout(500);assert.ok(refreshCalls>=1);report.passed.push('Refresh requests a current cached snapshot');
  for(const width of [390,768]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);await page.screenshot({path:path.join(artifacts,`mobile-${width}.png`),fullPage:true});}
  report.passed.push('390px and 768px layouts have no document overflow');
  const stale=await context.newPage();stale.on('pageerror',e=>report.errors.push(e.message));
  await stale.route('**/api/markets',route=>route.fulfill({json:{...snapshot,markets:snapshot.markets.map(m=>({...m,status:'stale'})),sources:snapshot.sources.map(s=>({...s,status:'stale'}))}}));
  await stale.goto(base);await stale.waitForFunction(()=>/stale|unavailable|no live|no fresh|offline/i.test(document.querySelector('#overall-status').textContent));
  assert.equal((await stale.locator('#liquidity').innerText()).trim(),'—');assert.equal((await stale.locator('#reference-price').innerText()).trim(),'—');report.passed.push('Stale data is labeled and excluded from headline price/liquidity');
  const aged=await context.newPage();await aged.route('**/api/markets',route=>route.fulfill({json:{...snapshot,updatedAt:new Date(Date.now()-300000).toISOString(),markets:snapshot.markets.map(m=>({...m,updatedAt:new Date(Date.now()-300000).toISOString()}))}}));
  await aged.goto(base);await aged.waitForTimeout(300);assert.equal((await aged.locator('#liquidity').innerText()).trim(),'—');report.passed.push('Old snapshots cannot retain live totals merely because HTTP succeeds');
  const offline=await context.newPage();offline.on('pageerror',e=>report.errors.push(e.message));await offline.route('**/api/markets',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await offline.goto(base);await offline.locator('#error-banner').waitFor({state:'visible'});assert.equal((await offline.locator('#liquidity').innerText()).trim(),'—');report.passed.push('Initial API outage renders an honest unavailable state');
  assert.deepEqual(report.errors,[]);report.passed.push('No uncaught browser errors during normal or failure flows');
 }finally{await browser.close();fs.writeFileSync(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
