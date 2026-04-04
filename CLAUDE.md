# Montly — Claude Code Guide

## Proje Özeti

**Montly**, kişisel ve grup finansmanı yönetimi için geliştirilmiş bir mobil uygulamadır. AI destekli analizler, kredi takibi, bütçe yönetimi ve grup harcama bölüşümü sunar.

- **iOS / Android:** Expo React Native
- **Backend:** Fastify (Node.js) → Render
- **Database:** MongoDB Atlas (Frankfurt — eu-central-1)
- **Dil desteği:** Türkçe, İngilizce, Rusça
- **AI:** Cloudflare Workers AI / Onysoft / Gemini

## Monorepo Yapısı

```
apps/
  mobile/   → Expo React Native uygulaması
  api/      → Fastify REST API
  web/      → React web dashboard (admin/iç kullanım)
packages/
  shared/   → Zod şemaları + typed API client (her iki taraf kullanır)
```

## Temel Komutlar

```bash
# API geliştirme
pnpm --filter api dev

# Mobile geliştirme
pnpm --filter mobile start

# Seed (test verisi)
SEED_DEMO_EMAIL=... SEED_DEMO_PASSWORD=... SEED_REFERENCE_DATE=YYYY-MM-DD pnpm --filter api seed

# Build
pnpm --filter api build

# Test
pnpm --filter api test

# Typecheck (tüm workspace)
pnpm typecheck
```

## Ortam Değişkenleri

`apps/api/.env` dosyasına bakarak local geliştirme için gerekli değerleri al.
`apps/api/.env.example` şablondur.

Production ortam değişkenleri Render dashboard'unda yönetilir.

Zorunlu değişkenler:
- `MONGODB_URI` — MongoDB Atlas bağlantı stringi
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — min 16 karakter
- `CORS_ORIGINS` — production'da zorunlu, virgülle ayrılmış URL listesi
- `CRON_SECRET` — production'da zorunlu, min 16 karakter
- `ADVISOR_PROVIDER` — `cloudflare` veya `onysoft`

## Kritik Mimari Notlar

### Ledger (İşlem Oluşturma)
İşlemler ve transferler doğrudan `TransactionModel.create()` ile oluşturulmamalı. Her zaman `apps/api/src/lib/ledger.ts` içindeki fonksiyonlar kullanılmalı:
- `createNormalTransaction()` — gelir/gider
- `createTransferPair()` — hesaplar arası transfer

### i18n Zorunluluğu
`apps/mobile/locales/` altındaki `en.json`, `tr.json`, `ru.json` dosyaları her zaman senkron olmalı. Yeni bir i18n anahtarı eklenince 3 dil dosyasına da eklenmelidir. CI bu kontrolü yapar.

### Shared Package
`packages/shared/src/schemas.ts` hem API hem mobile tarafından kullanılır. Bu dosyada yapılan değişiklikler her iki tarafı etkiler. Her zaman `zod` şemasını önce tanımla, tipi `z.infer<>` ile türet.

### Recurring Runner
`/internal-cron/run-recurring` endpoint'i production'da harici bir cron servisi tarafından çağrılır. `CRON_SECRET` header ile korunur. Local'de manuel tetiklenebilir.

### AI Provider
`ADVISOR_PROVIDER` env değişkeni ile kontrol edilir:
- `cloudflare` — Cloudflare Workers AI (model: `@cf/meta/llama-3.2-3b-instruct`)
- `onysoft` — Onysoft API (model: `meta-llama/llama-3.3-70b-instruct:free`)

### Fastify Plugin Timeout
`onReady` hook'u içinde MongoDB bağlantısı kurulur. MongoDB Atlas cluster'ı Frankfurt (eu-central-1) bölgesinde olmalı, aksi halde Fastify'ın 10 saniyelik `pluginTimeout`'u aşılır.

## Model Yapıları

| Model | Açıklama |
|---|---|
| `User` | Kullanıcı profili, tercihler, OAuth providers |
| `Account` | Hesaplar (cash, bank, credit, loan, debt) |
| `Transaction` | Gelir/gider/transfer işlemleri |
| `RecurringRule` | Tekrarlayan ödeme kuralları |
| `UpcomingPayment` | Yaklaşan ödemeler |
| `Budget` | Kategori bazlı bütçe limitleri |
| `Category` | Harcama kategorileri |
| `Group` / `GroupExpense` | Grup harcama bölüşümü |
| `RefreshToken` | JWT refresh token yönetimi |

## Deployment

**API:** Render Web Service
- Build: `pnpm --filter api build`
- Start: `pnpm --filter api start:prod`
- Health check: `GET /health`

**Mobile:** Expo EAS Build
- `eas build --platform ios`
- `eas build --platform android`
- `eas submit` ile store'a gönderim

## Test Kullanıcısı

Seed scripti ile oluşturulmuş test verisi:
- Email: `screenshots@montly.dev`
- Şifre: `ShotReady123`
- Referans tarih: 2026-04-01

## Notlar

- MongoDB Atlas cluster'ı Frankfurt (eu-central-1) bölgesinde, AWS üzerinde çalışıyor.
- Render servisi de Frankfurt bölgesinde.
- Free tier M0 cluster — 60 gün hareketsizlik sonrası Atlas monitoring'i duraklatabilir (cluster kapanmaz ama ilk bağlantı yavaşlayabilir).
