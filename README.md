# THEO Atlas

A local, read-only Autheo market monitor. No wallet, trading keys, paid API, frontend CDN or package installation required.

## Run on Windows

Requires existing Node.js 22 or newer. Double-click **start.cmd** in this folder, or run:

```powershell
cd 'D:\New folder\OpenClaw\Projects\theo-tracker'
node server.mjs
```

Open **http://localhost:4317**. Keep the terminal open; Ctrl+C stops the server. The listener is loopback-only. Optional `PORT` changes the port for a manual launch; the one-click launcher uses 4317.

## What is covered

- MEXC THEO/USDT: ticker, 24-hour quote volume, best spread, ±2% displayed order-book depth and hourly candle closes.
- Hydrex on Base: THEO/USDC pool USD price, volume and total reserves.
- Uniswap v3 on Robinhood Chain: THEO/USDG and THEO/NVDA pool price, volume and reserves.
- Additional pools discovered on the first provider results page for the two exact THEO contracts. These are shown separately and excluded from official-market headline totals.

Robinhood Chain pools are **not** a claim that the Robinhood brokerage lists THEO. Hydrex is the spelling used by Autheo’s official site.

## Data definitions

- DEX liquidity = GeckoTerminal `reserve_in_usd`, both assets' reported pool reserve value. This is not a sell quote, withdrawable personal balance or guaranteed liquidity at the current price. Concentrated pools may have liquidity outside the active range.
- CEX depth = sum of price × quantity on each side within 2% of the current bid/ask midpoint, from up to 1,000 levels. The app identifies truncation as a lower bound. USDT units stay separate from USD; no assumed conversion or aggregate mixing.
- DEX 24h volume sums unique official DEX pools only. MEXC volume is in USDT and displayed separately. Volume is not liquidity.
- Headline reference price comes from the most liquid live official DEX pool, not a thin-pool average or a global oracle.
- MEXC change is recomputed from last/open because provider `priceChangePercent` was ambiguously scaled during verification. New listings can have less than 24h history; opening-price change can be large.
- Unknown market cap and cross-chain FDV are deliberately omitted. Bridged token supplies must not be summed as if independent.
- `updatedAt` means retrieval time. GeckoTerminal does not provide an underlying market timestamp in these payloads. Fetching a price does not prove recent trading. MEXC book timestamp is checked against a five-minute maximum age.
- Cache/poll interval: 60 seconds, coalesced server requests. Provider caching and rate limits can add latency. Failures preserve an explicitly stale previous snapshot or show unavailable; stale values are excluded from fresh totals.
- Chart: reported MEXC hourly candle closes, not interpolated ticks. Sparse history is honest, not padded. Current hour can be incomplete.

## Sources / identity provenance

Official market and contract reference, checked 2026-10-01: https://www.autheo.com/token-launch

| Network | THEO contract |
|---|---|
| Base | `0xebe516a20238f79dc20b07ead6768e08891ed309` |
| Robinhood | `0x3dc751e0da01812e6d9143cc696e7f07ea94da48` |

Public adapters use https://api.mexc.com/api/v3 and https://api.geckoterminal.com/api/v2 . API usage is read-only. Provider availability is not guaranteed; no keys are configured. Source links are present in the dashboard. This custom view uses existing free feeds because official listing and explorer pages do not combine DEX reserves and CEX depth in one view.

## Project layout / checks

- `markets.mjs`: identities and pure numeric adapters.
- `feeds.mjs`: public requests, cache, coalescing, independent failures.
- `server.mjs`: loopback server and exact static-file allowlist.
- `public/`: dependency-free responsive frontend.
- `tests/`: calculations, identity, failure and browser checks.
- `.work/`: ignored local verification artifacts, kept on D:.

Run `npm test` (no install needed). UI browser checks use an existing Playwright installation via `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE`; no runtime dependency is added.

## Scope and next steps

This is a public-market v0.1, not an account/LP-positions tracker. It does not guarantee all listings on all networks, persist historical liquidity, provide alerts, or execute transactions. Add new confirmed contracts/official markets in `markets.mjs`; don't trust ticker matching alone. Last observations are saved locally in `.work/last-snapshot.json` and remain explicitly stale if the next refresh fails, including after restart. No public deployment, startup service or remote access has been enabled.
