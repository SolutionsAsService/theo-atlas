# Verification record — 2026-10-01

- Official identities and all four markets confirmed against https://www.autheo.com/token-launch.
- Actual MEXC ticker, full asset identity, 1,000-level depth request and hourly candles received.
- Actual GeckoTerminal Base and Robinhood pool responses received, including three official pools and two additional pools. Extra pools are never included in official headline totals.
- Node native tests: 15 pass (numeric/identity/depth/history/cache/concurrency/staleness/initial outage/partial availability/HTTP boundaries/pool IDs/zero orders/source ages/launch period/persistence/429).
- Windows Node.js v22.13.1 smoke: all three source groups live, six markets; temporary test process exited in finally. Receipt `.work/windows-smoke.json`.
- Desktop browser: real data render, filters, search, refresh, JSON export verified. Mobile overflow identified and fixed at its positioned scroll-container cause.
- Final browser/failure report and screenshots: `.work/artifacts/` (see browser-report.json for actual final checks and source availability).
- Public feeds can fail or throttle; HTTP 429 observed during testing. The app distinguishes live/partial/stale/unavailable and excludes stale readings from headline metrics. Last snapshot persists locally.
- No deployment, wallet, transaction, secrets, startup service, paid service or dependency installation performed.

Claim ceiling: this is a local read-only tracker for the known official venues plus first-page discovery on the two confirmed chains, not guaranteed exhaustive market coverage or a holdings tracker.

## Final handoff

- All 9 final browser checks passed, no uncaught browser errors. Source report showed MEXC, Base and Robinhood all live with no partial flag.
- Final Windows launch via `start.cmd` succeeded. http://localhost:4317 returned HTTP 200; API returned 6 markets, all three source groups live. Windows server left running and launcher requested the default browser open the dashboard.
- Final visual desktop and mobile review performed using Chromium screenshots. Windows native desktop screenshot was unavailable through the computer tool; no claim of native screenshot verification.
