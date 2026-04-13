# cron-job.org Kurulum Talimatları

## 1. Hesaba giriş yap
https://cron-job.org adresine git, hesabına giriş yap.

## 2. Yeni job oluştur
"Create cronjob" butonuna tıkla.

## 3. Job ayarları
- **Title:** Montly - Send Scheduled Notifications
- **URL:** https://[RENDER_URL]/api/cron/send-notifications
- **Request method:** POST
- **Headers:**
  - Key: `Authorization` → Value: `Bearer [CRON_SECRET_değerin]`
  - Key: `Content-Type` → Value: `application/json`
- **Request body:** `{}`

## 4. Zamanlama
- **Schedule:** Her saat başı
- Cron expression: `0 * * * *`

## 5. Kaydet ve test et
- "Create" butonuna bas
- Job listesinde oluşturulan job'a tıkla
- "Run now" ile manuel test et
- "Execution history" sekmesinden sonucu kontrol et

## Notlar
- CRON_SECRET değeri Render'daki environment variable ile aynı olmalı
- Job başarılı çalışırsa HTTP 200 döner, web panelin "Gönderim Logları" sekmesinde görünür
- İlk birkaç saatte gönderim olmayabilir — o saate denk gelen bildirim yoksa normal
