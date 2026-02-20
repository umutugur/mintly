# FinSight Monorepo

Monorepo structure:
- `apps/api`: Fastify + TypeScript + MongoDB (Mongoose)
- `apps/mobile`: Expo React Native + TypeScript
- `packages/shared`: shared Zod schemas + typed API client

## Deploy To Render

### API service settings
- Service type: `Web Service` (Node)
- Root directory: repo root (`/`)
- Build command:
```bash
pnpm install --frozen-lockfile && pnpm -C apps/api build
```
- Start command:
```bash
pnpm start:api
```
- Health check path:
```text
/health
```

### Required API environment variables
- `NODE_ENV=production`
- `PORT` (Render injects this automatically)
- `MONGODB_URI` (MongoDB Atlas connection string)
- `JWT_ACCESS_SECRET` (minimum 16 chars)
- `JWT_REFRESH_SECRET` (minimum 16 chars)
- `ACCESS_TTL_MIN` (example: `15`)
- `REFRESH_TTL_DAYS` (example: `30`)
- `CRON_SECRET` (minimum 16 chars; protects `/recurring/run-due`)
- `CORS_ORIGINS` (comma-separated, no spaces unless trimmed)
- `GOOGLE_OAUTH_CLIENT_IDS` (comma-separated OAuth client IDs accepted by backend token verifier)
- `APPLE_OAUTH_CLIENT_IDS` (comma-separated Apple audience/client IDs accepted by backend token verifier)

Example `CORS_ORIGINS`:
```text
https://finsight.app,https://www.finsight.app
```

Example OAuth verifier config:
```text
GOOGLE_OAUTH_CLIENT_IDS=your-web-client-id.apps.googleusercontent.com,com.finsight.app
APPLE_OAUTH_CLIENT_IDS=com.finsight.app
```

### Mobile OAuth env variables (Expo)

Set these in `apps/mobile/.env` (or EAS env):
- `EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`

### Render API behavior notes
- API binds to `0.0.0.0` and uses `PORT`.
- Startup fails fast if env config is invalid.
- Security middleware in production:
  - `@fastify/helmet`
  - global rate limiting
  - strict CORS origin allowlist

## Operations

### Trigger recurring runner securely
Use either `x-cron-secret` or `Authorization: Bearer <CRON_SECRET>`.

Header secret form:
```bash
curl -X POST "https://<your-render-service>/recurring/run-due" \
  -H "x-cron-secret: $CRON_SECRET"
```

Bearer form:
```bash
curl -X POST "https://<your-render-service>/recurring/run-due" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Local smoke test
Start the API, then run:
```bash
pnpm smoke:api
```

Optional custom base URL:
```bash
API_BASE_URL="http://127.0.0.1:4000" pnpm smoke:api
```

## i18n Lint Policy (CI Hard-Fail)

FinSight enforces strict i18n in mobile UI code. User-facing text must never be hardcoded.

### What to do instead
- Use `t('...')` for all screen text, button labels, placeholders, headers, empty states, alerts, and accessibility labels.
- Add translation keys under:
  - `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/locales/en.json`
  - `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/locales/tr.json`
  - `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/locales/ru.json`
- Keep keys grouped by domain (`auth`, `dashboard`, `transactions`, `groups`, etc.).

### What is allowed
- Test files (`*.test.ts`, `*.test.tsx`)
- Translation JSON files
- Non-user-facing technical constants (ids, enum-like internal values, symbols/punctuation)

### Run locally
```bash
pnpm lint:i18n
```

or only mobile package:
```bash
pnpm -C apps/mobile lint:i18n
```

`lint:i18n` fails the build when forbidden raw UI strings are introduced.

The hardcoded-string checker explicitly fails when it finds patterns like:
- `<Text>Literal Text</Text>`
- `title: "Literal"`
- `placeholder: "Literal"`
- `Alert.alert("Literal", ...)`

## i18n Key Convention

Use this key format:

```text
<namespace>.<screenOrDomain>.<component>.<purpose>
```

Examples:
- `common.buttons.save`
- `auth.login.form.title`
- `auth.login.form.email.label`
- `groups.detail.summary.totalSpending`
- `errors.auth.invalidCredentials`

### Locale file structure

Locale files live under:
- `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/locales/en.json`
- `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/locales/tr.json`
- `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/locales/ru.json`

Required top-level namespaces:
- `common`
- `auth`
- `dashboard`
- `transactions`
- `analytics`
- `groups`
- `advisor`
- `profile`
- `settings`
- `errors`

### How to add translations

1. Add the new key in all 3 locale files (`en`, `tr`, `ru`) using the same path.
2. Prefer reusing existing keys before creating a new one.
3. Use `t('...')` (or `useT` helper) in UI code; do not hardcode text.
4. For navigation labels/titles, use i18n keys (for example keys from `/Users/umutugur/finsight/apps/mobile/src/shared/i18n/keys.ts`).
5. Run:

```bash
pnpm lint:i18n
pnpm -C apps/mobile exec tsc --noEmit
```

## Mobile Production Readiness

### Global resilience additions
- Global render `ErrorBoundary` is enabled in mobile app root.
- API/network errors are normalized through `/Users/umutugur/finsight/apps/mobile/src/shared/utils/apiErrorText.ts`.
- Offline connectivity banner is enabled globally via NetInfo provider.
- React Query retries avoid `401` retry loops and apply conservative retry behavior for timeout/offline errors.

### Sentry (Expo mobile)

Sentry is initialized only when:
- app is in non-development mode, or
- `EXPO_PUBLIC_ENABLE_SENTRY=true` in development.

Required mobile env vars for Sentry:
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_SENTRY_ENV` (optional, defaults by build mode)
- `EXPO_PUBLIC_ENABLE_SENTRY` (optional, dev-only override)

Telemetry breadcrumbs added (no PII):
- `auth.login`
- `auth.register`
- `auth.logout`
- `transactions.create`
- `transactions.update`
- `transactions.delete`
- `groups.expense.create`
- `analytics.load.failure`

### Sentry source maps (production)

1. Configure Sentry env in EAS build environment:
   - `SENTRY_AUTH_TOKEN`
   - `SENTRY_ORG`
   - `SENTRY_PROJECT`
2. Build production app with EAS:
```bash
pnpm -C apps/mobile eas build --profile production --platform ios
pnpm -C apps/mobile eas build --profile production --platform android
```
3. Ensure release naming is stable (`finsight-mobile@<version>+<runtime>`) and matches uploaded artifacts.

### EAS build profiles

File:
- `/Users/umutugur/finsight/apps/mobile/eas.json`

Profiles:
- `development`
- `preview`
- `production`

### Versioning strategy

Configured in `/Users/umutugur/finsight/apps/mobile/app.json`:
- Expo app `version` for semantic release.
- iOS `buildNumber` for TestFlight/App Store increments.
- Android `versionCode` for Play Store increments.

## Mobile i18n parity check

Command:
```bash
pnpm -C apps/mobile i18n:check
```

This command hard-fails when:
- locale files (`tr/en/ru`) are not in parity,
- code references translation keys that are missing in any locale.

## Runtime i18n guard

Mobile runtime translation behavior is strict:
- English fallback is disabled (`fallbackLng: false`).
- Missing translation keys return empty text (not raw key, not English fallback).
- Missing keys are logged once per `(locale, key, screen)` with screen inference from stack trace:
  - `[i18n] Missing translation key "<key>" for locale "<locale>" on "<ScreenName>"`
