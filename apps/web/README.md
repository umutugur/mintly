# Montly Web Panel

Internal admin and analytics SPA for Montly.

## Local run

From the monorepo root:

```bash
pnpm install
pnpm dev:api
pnpm dev:web
```

The Vite app runs on `http://localhost:5173` and defaults to `http://localhost:4000` if `VITE_API_URL` is not set.

For a standalone app run (inside `apps/web`):

```bash
npm install
npm run dev
```

## Required env vars

- `VITE_API_URL`: deployed Montly API base URL
- `VITE_ENV_BADGE`: `preview` or `production`
- `VITE_COMMIT_SHA`: optional build identifier

Copy `.env.example` to `.env` (or configure the values in Render).

## Render deployment (recommended: Static Site)

Create a new Render **Static Site** with:

- Root Directory: `apps/web`
- Build Command:
  - Preferred after checking in an `apps/web/package-lock.json`: `npm ci && npm run build`
  - Without a lockfile yet: `npm install && npm run build`
- Publish Directory: `dist`

Set these environment variables:

- `VITE_API_URL=https://your-api-host.onrender.com`
- `VITE_ENV_BADGE=preview` (or `production`)
- `VITE_COMMIT_SHA=<optional git sha>`

Add a rewrite rule so SPA routes resolve correctly:

- Source: `/*`
- Destination: `/index.html`
- Action: `Rewrite`

## Optional static smoke test

Inside `apps/web`:

```bash
npm run build
npm run start
```
