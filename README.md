# AD88 Platform

AD88 is a React/Vite finance workspace with a polished market dashboard, sandbox paper trading, international registration, server-backed account management, cross-device workspace sync, and a separate admin console.

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

`render.yaml` is ready for a Render Node web service and a PostgreSQL database. Connect this repository in Render and use the blueprint configuration, then set the two private admin values:

- `AD88_ADMIN_EMAIL`: the administrator email used only for `/admin` login
- `AD88_ADMIN_PASSWORD`: the administrator password stored only as a Render secret

The blueprint generates `AUTH_SECRET` and links `DATABASE_URL` to the database. Account records, password hashes, admin actions and user workspace state are then shared across browsers and devices. Do not use a demo password in production.

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check: `/`
- SPA fallback, same-origin market/news proxy, registration/login, admin account operations and workspace sync are handled by `server.mjs`.

Trading and points actions remain sandbox/paper workflows. No real orders or funds are sent.

## GitHub publishing

Create or select the target GitHub repository, push the project, then connect that repository to Render. The local workspace must be linked to the owner's GitHub remote and authenticated GitHub account before the push can be performed.
