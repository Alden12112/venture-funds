# AD88 Platform

AD88 is a React/Vite finance workspace with a polished market dashboard, sandbox paper trading, international registration, server-backed account management, cross-device workspace sync, and a separate admin console service.

## Local preview

```bash
npm ci
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

Both services share `AUTH_SECRET`; the admin service forwards account, support, trade and workspace API calls to the frontend service, so the two addresses see the same live data. The two bundles are built with different `VITE_APP_SURFACE` values and the server also enforces `APP_SURFACE` at runtime.

When the blueprint is first applied, set the two private admin values on `ad88-platform`:

- `AD88_ADMIN_EMAIL`: the administrator email used only for `/admin` login
- `AD88_ADMIN_PASSWORD`: the administrator password stored only as a Render secret

The admin service reads those values from the frontend service through Render's private `fromService` environment references. Do not put the password in GitHub, source files, or client-side environment variables.

The blueprint generates `AUTH_SECRET` and provisions `ad88-postgres`; its connection string is injected into the frontend as `DATABASE_URL`. The server creates the account, ledger, support, trade-audit, credits, notification and blacklist tables on startup. If the Render account no longer offers the free Postgres plan, Blueprint sync will require selecting the lowest available managed Postgres plan before the database can be created. Do not use a demo password in production.

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check: `/`
- SPA fallback, same-origin market/news proxy, registration/login, admin account operations and workspace sync are handled by `server.mjs`.

Trading and points actions remain sandbox/paper workflows. No real orders or funds are sent.

## GitHub publishing

The repository is `Alden12112/ad88-platform`. Push the `main` branch, then sync the Render blueprint so the second `ad88-admin` service is created alongside the existing frontend service.
