# FinSight API

## OAuth Environment Variables

For `POST /auth/oauth`, configure allowed audiences for server-side token verification:

- `GOOGLE_OAUTH_CLIENT_IDS` (comma-separated)
- `APPLE_OAUTH_CLIENT_IDS` (comma-separated)

Example:

```bash
GOOGLE_OAUTH_CLIENT_IDS=your-web-client-id.apps.googleusercontent.com,com.finsight.app
APPLE_OAUTH_CLIENT_IDS=com.finsight.app
```

## Advisor (Cloudflare Workers AI) Environment

Required for `GET /advisor/insights` when `ADVISOR_PROVIDER=cloudflare`:

- `ADVISOR_PROVIDER=cloudflare`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AUTH_TOKEN`
- `CLOUDFLARE_AI_MODEL` (default: `@cf/meta/llama-3.1-8b-instruct`)

Optional tuning:

- `CLOUDFLARE_HTTP_TIMEOUT_MS` (default: `45000`)
- `CLOUDFLARE_MAX_ATTEMPTS` (default: `2`)

Example:

```bash
ADVISOR_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_AUTH_TOKEN=your-token
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct
CLOUDFLARE_HTTP_TIMEOUT_MS=45000
CLOUDFLARE_MAX_ATTEMPTS=2
```

## Bootstrap Global Categories

Run from the monorepo root:

```bash
pnpm -C apps/api bootstrap
```

## Seed Demo Data

Run from the monorepo root:

```bash
pnpm -C apps/api seed
```

Notes:
- The seeder uses `MONGODB_URI` from env (`apps/api/.env` in local development).
- It safely resets and re-creates only the demo user dataset.
- Demo login after seeding:
  - `demo@finsight.dev`
  - `Password123`

## MongoDB Index Note

If your database still has an old non-partial unique index on `firebaseUid`, run this once:

```javascript
db.users.dropIndex("firebaseUid_1")
```

Then restart the API so the partial unique index can be applied.
