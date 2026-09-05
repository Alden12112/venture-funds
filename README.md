# AD88 Platform

AD88 is a React/Vite finance workspace with a polished market dashboard, sandbox paper trading, international registration, server-backed account management, cross-device workspace sync, and a separate admin console service.

## Local preview

```bash
npm ci
npm run start
# In a second terminal:
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Production build

```bash
npm run build
```

The production output is generated in `dist/`.

## Render

`render.yaml` provisions two Render Node web services:

- `ad88-platform`: public user-facing frontend
- `ad88-admin`: private administrator console

Both services share `AUTH_SECRET`; the admin service forwards account, support, trade, workspace, market and news API calls to the frontend service, so the two addresses see the same live data and quote snapshot. The two bundles are built with different `VITE_APP_SURFACE` values and the server also enforces `APP_SURFACE` at runtime.

When the blueprint is first applied, set the two private admin values on
`ad88-platform` using the exact variable names below. The email and password
belong in the **Value** column; do not use an email address as an environment
variable key.

- `AD88_ADMIN_EMAIL`: the administrator email used only for `/admin` login
- `AD88_ADMIN_PASSWORD`: the administrator password stored only as a Render secret
- `MT5_INGEST_SECRET`: optional one-way secret for a user-hosted MT5 EA to publish read-only Bid/Ask/Last references. It belongs only on `ad88-platform`, never in the browser or the admin service.
- `OANDA_PRACTICE_ACCOUNT_ID` and `OANDA_PRACTICE_TOKEN`: optional OANDA **practice** account values for the server-only, read-only metals, energy and FX reference feed. The application uses only OANDA's instrument-discovery and pricing endpoints; it cannot submit OANDA orders, access live OANDA, or change an OANDA balance.

The admin service inherits those values and `AUTH_SECRET` from the frontend
service through Render's private `fromService` environment references. Do not
put the password in GitHub, source files, or client-side environment variables.

The blueprint generates `AUTH_SECRET` and provisions `ad88-postgres`; its connection string is injected into the frontend as `DATABASE_URL`. The server creates the account, ledger, support, trade-audit, credits, notification and blacklist tables on startup. If the Render account no longer offers the free Postgres plan, Blueprint sync will require selecting the lowest available managed Postgres plan before the database can be created. Do not use a demo password in production.

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check: `/health`
- SPA fallback, same-origin market/news proxy, registration/login, admin account operations and workspace sync are handled by `server.mjs`.

Trading and points actions remain sandbox/paper workflows. No real orders or funds are sent.

## Optional OANDA practice market feed

The public fallback sources may be delayed or unavailable from hosted environments. For a stronger no-desktop reference feed, create an OANDA practice account and add its account ID and personal access token to the two private Render variables above. The server discovers the instruments enabled for that practice account and reads only prices for supported XAU, XAG, WTI, Brent, natural gas, copper and FX instruments. No MT5 terminal needs to stay running, and the application intentionally has no OANDA order endpoint.

## Optional MT5 market-data bridge

AD88 can display a broker-authorized MT5 reference feed without taking control of the terminal. The bridge is read-only:

```text
MT5 terminal → AD88MarketBridge.mq5 → POST /api/mt5/ticks → AD88 SSE → Trade workspace
```

Use a unique `MT5_INGEST_SECRET` in Render and the same value only in the EA input parameters. Do not provide MT5 account credentials to AD88, commit the value to Git, or place it in a browser setting. Setup and supported-symbol details are in [`docs/mt5-bridge.md`](docs/mt5-bridge.md).

## GitHub publishing

The repository is `Alden12112/ad88-platform`. Push the `main` branch, then sync the Render blueprint so the second `ad88-admin` service is created alongside the existing frontend service.
