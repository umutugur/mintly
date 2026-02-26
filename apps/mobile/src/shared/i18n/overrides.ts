export const translationOverrides = {
  en: {
    auth: {
      login: {
        oauth: {
          appleCta: 'Apple',
          appleUnavailable: 'Apple sign-in is not available on this device.',
          genericError: 'OAuth sign-in failed. Please try again.',
          googleCta: 'Google',
          googleEnvMissingInBuild: 'Google OAuth env missing in build.',
          googleUnavailable: 'Google sign-in is not configured.',
          tokenMissing: 'Could not read identity token from provider.',
        },
      },
    },
    common: {
      loading: 'Loading...',
      error: 'Error',
    },
    errors: {
      api: {
        OAUTH_EMAIL_NOT_VERIFIED: 'OAuth account email is not verified.',
        OAUTH_EMAIL_REQUIRED: 'Your account email is required for first OAuth sign-in.',
        OAUTH_NONCE_INVALID: 'OAuth nonce validation failed. Please try again.',
        OAUTH_PROVIDER_NOT_CONFIGURED: 'OAuth provider is not configured.',
        OAUTH_PROVIDER_NOT_SUPPORTED: 'OAuth provider is not supported.',
        OAUTH_TOKEN_INVALID: 'OAuth token is invalid or expired.',
      },
    },
    tx: {
      edit: {
        title: 'Edit Transaction',
        success: 'Transaction updated successfully.',
        errorTitle: 'Could not update transaction',
        transferReadOnly: 'Transfer transactions cannot be edited.',
      },
      delete: {
        confirmTitle: 'Delete transaction',
        confirmBody: 'Are you sure you want to delete "{{title}}"?',
        success: 'Transaction deleted.',
      },
      form: {
        save: 'Save Transaction',
      },
    },
    transfer: {
      delete: {
        confirmTitle: 'Delete transfer',
        confirmBody: 'Both sides of this transfer will be removed. Continue?',
        success: 'Transfer deleted.',
      },
      edit: {
        title: 'Edit transfer',
        recreateWarning: 'Editing transfer is not available yet. Recreate it if needed.',
      },
    },
  },
  tr: {
    auth: {
      login: {
        oauth: {
          appleCta: 'Apple',
          appleUnavailable: 'Apple ile giriş bu cihazda kullanılamıyor.',
          genericError: 'OAuth girişi başarısız oldu. Lütfen tekrar deneyin.',
          googleCta: 'Google',
          googleEnvMissingInBuild: 'Derlemede Google OAuth ortam değişkenleri eksik.',
          googleUnavailable: 'Google ile giriş yapılandırılmamış.',
          tokenMissing: 'Sağlayıcı kimlik belirteci alınamadı.',
        },
      },
    },
    common: {
      loading: 'Yükleniyor...',
      error: 'Hata',
    },
    errors: {
      api: {
        OAUTH_EMAIL_NOT_VERIFIED: 'OAuth hesabı e-posta adresi doğrulanmamış.',
        OAUTH_EMAIL_REQUIRED: 'İlk OAuth girişinde hesap e-postası gereklidir.',
        OAUTH_NONCE_INVALID: 'OAuth nonce doğrulaması başarısız oldu. Lütfen tekrar deneyin.',
        OAUTH_PROVIDER_NOT_CONFIGURED: 'OAuth sağlayıcısı yapılandırılmamış.',
        OAUTH_PROVIDER_NOT_SUPPORTED: 'OAuth sağlayıcısı desteklenmiyor.',
        OAUTH_TOKEN_INVALID: 'OAuth belirteci geçersiz veya süresi dolmuş.',
      },
    },
    tx: {
      edit: {
        title: 'İşlemi Düzenle',
        success: 'İşlem başarıyla güncellendi.',
        errorTitle: 'İşlem güncellenemedi',
        transferReadOnly: 'Transfer işlemleri doğrudan düzenlenemez.',
      },
      delete: {
        confirmTitle: 'İşlemi sil',
        confirmBody: '"{{title}}" işlemini silmek istediğinizden emin misiniz?',
        success: 'İşlem silindi.',
      },
      form: {
        save: 'İşlemi Kaydet',
      },
    },
    transfer: {
      delete: {
        confirmTitle: 'Transferi sil',
        confirmBody: 'Bu transferin iki tarafı da silinecek. Devam edilsin mi?',
        success: 'Transfer silindi.',
      },
      edit: {
        title: 'Transferi düzenle',
        recreateWarning: 'Transfer düzenleme henüz yok. Gerekirse transferi yeniden oluşturun.',
      },
    },
  },
  ru: {
    auth: {
      login: {
        oauth: {
          appleCta: 'Apple',
          appleUnavailable: 'Вход через Apple недоступен на этом устройстве.',
          genericError: 'Не удалось выполнить вход через OAuth. Повторите попытку.',
          googleCta: 'Google',
          googleEnvMissingInBuild: 'В этой сборке отсутствуют env-переменные Google OAuth.',
          googleUnavailable: 'Вход через Google не настроен.',
          tokenMissing: 'Не удалось получить токен удостоверения.',
        },
      },
    },
    common: {
      loading: 'Загрузка...',
      error: 'Ошибка',
    },
    errors: {
      api: {
        OAUTH_EMAIL_NOT_VERIFIED: 'Email OAuth-аккаунта не подтвержден.',
        OAUTH_EMAIL_REQUIRED: 'Для первого входа через OAuth требуется email аккаунта.',
        OAUTH_NONCE_INVALID: 'Проверка OAuth nonce не пройдена. Повторите попытку.',
        OAUTH_PROVIDER_NOT_CONFIGURED: 'OAuth-провайдер не настроен.',
        OAUTH_PROVIDER_NOT_SUPPORTED: 'OAuth-провайдер не поддерживается.',
        OAUTH_TOKEN_INVALID: 'OAuth токен недействителен или истек.',
      },
    },
    tx: {
      edit: {
        title: 'Редактировать транзакцию',
        success: 'Транзакция успешно обновлена.',
        errorTitle: 'Не удалось обновить транзакцию',
        transferReadOnly: 'Транзакции-переводы нельзя редактировать напрямую.',
      },
      delete: {
        confirmTitle: 'Удалить транзакцию',
        confirmBody: 'Удалить транзакцию "{{title}}"?',
        success: 'Транзакция удалена.',
      },
      form: {
        save: 'Сохранить транзакцию',
      },
    },
    transfer: {
      delete: {
        confirmTitle: 'Удалить перевод',
        confirmBody: 'Обе стороны этого перевода будут удалены. Продолжить?',
        success: 'Перевод удален.',
      },
      edit: {
        title: 'Редактировать перевод',
        recreateWarning: 'Редактирование перевода пока недоступно. При необходимости создайте перевод заново.',
      },
    },
  },
} as const;
