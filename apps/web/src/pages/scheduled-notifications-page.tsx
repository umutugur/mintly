import {
  Bell,
  CalendarClock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createScheduledNotification,
  deleteScheduledNotification,
  getNotificationLogs,
  getScheduledNotifications,
  updateScheduledNotification,
  uploadScheduledNotifications,
} from '../lib/api';
import type { ScheduledNotification } from '../lib/schemas';
import { cn } from '../lib/utils';
import { Badge, Button, Card } from '../components/ui';
import { PageSection } from '../providers';
import { useErrorToast, useUi } from '../providers';

type Tab = 'notifications' | 'logs';
type Lang = 'tr' | 'en' | 'ru';

const CATEGORY_LABELS: Record<string, string> = {
  welcome: 'Hoş Geldin',
  reminder: 'Hatırlatma',
  tip: 'İpucu',
  feature: 'Özellik',
  motivation: 'Motivasyon',
  winback: 'Geri Kazan',
  seasonal: 'Sezonluk',
};

const TRIGGER_LABELS: Record<string, string> = {
  days_after_register: 'Kayıt sonrası gün',
  days_inactive: 'Pasif gün',
  fixed_date: 'Sabit tarih (ayın günü)',
  recurring: 'Tekrarlayan',
};

const CATEGORY_BADGE_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'warning'> = {
  welcome: 'success',
  reminder: 'neutral',
  tip: 'neutral',
  feature: 'warning',
  motivation: 'success',
  winback: 'danger',
  seasonal: 'warning',
};

const LOG_STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'warning'> = {
  sent: 'success',
  partial: 'warning',
  failed: 'danger',
};

const LOG_STATUS_LABEL: Record<string, string> = {
  sent: 'Gönderildi',
  partial: 'Kısmi',
  failed: 'Başarısız',
};

interface NotificationFormState {
  title_tr: string;
  title_en: string;
  title_ru: string;
  body_tr: string;
  body_en: string;
  body_ru: string;
  category: string;
  trigger_type: string;
  trigger_value: string;
  recurring_pattern: string;
  recurring_day: string;
  recurring_hour: string;
}

const EMPTY_FORM: NotificationFormState = {
  title_tr: '',
  title_en: '',
  title_ru: '',
  body_tr: '',
  body_en: '',
  body_ru: '',
  category: 'reminder',
  trigger_type: 'days_after_register',
  trigger_value: '0',
  recurring_pattern: '',
  recurring_day: '',
  recurring_hour: '9',
};

function formStateToPayload(form: NotificationFormState) {
  return {
    title: { tr: form.title_tr, en: form.title_en, ru: form.title_ru },
    body: { tr: form.body_tr, en: form.body_en, ru: form.body_ru },
    category: form.category as ScheduledNotification['category'],
    trigger_type: form.trigger_type as ScheduledNotification['trigger_type'],
    trigger_value: form.trigger_value !== '' ? Number(form.trigger_value) : null,
    recurring_pattern:
      form.recurring_pattern !== ''
        ? (form.recurring_pattern as ScheduledNotification['recurring_pattern'])
        : null,
    recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
    recurring_hour: form.recurring_hour !== '' ? Number(form.recurring_hour) : 9,
    is_active: true,
  };
}

function notificationToFormState(n: ScheduledNotification): NotificationFormState {
  return {
    title_tr: n.title.tr,
    title_en: n.title.en,
    title_ru: n.title.ru,
    body_tr: n.body.tr,
    body_en: n.body.en,
    body_ru: n.body.ru,
    category: n.category,
    trigger_type: n.trigger_type,
    trigger_value: n.trigger_value != null ? String(n.trigger_value) : '',
    recurring_pattern: n.recurring_pattern ?? '',
    recurring_day: n.recurring_day != null ? String(n.recurring_day) : '',
    recurring_hour: String(n.recurring_hour),
  };
}

function NotificationModal(props: {
  initial?: ScheduledNotification;
  onClose: () => void;
  onSave: (payload: ReturnType<typeof formStateToPayload>, id?: string) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<NotificationFormState>(
    props.initial ? notificationToFormState(props.initial) : EMPTY_FORM,
  );
  const [lang, setLang] = useState<Lang>('tr');

  function update(key: keyof NotificationFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    props.onSave(formStateToPayload(form), props.initial?._id);
  }

  const showTriggerValue = ['days_after_register', 'days_inactive', 'fixed_date'].includes(
    form.trigger_type,
  );
  const showRecurringPattern = ['fixed_date', 'recurring'].includes(form.trigger_type);
  const showRecurringDay = form.trigger_type === 'recurring';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-panel-900 p-6 shadow-panel max-h-[90vh]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">
            {props.initial ? 'Bildirimi Düzenle' : 'Yeni Bildirim'}
          </h3>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl p-2 text-panel-200 hover:bg-white/5"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Language tabs */}
          <div className="flex gap-1 rounded-2xl bg-white/5 p-1">
            {(['tr', 'en', 'ru'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  'flex-1 rounded-xl py-2 text-sm font-semibold transition',
                  lang === l
                    ? 'bg-accent-500 text-panel-950'
                    : 'text-panel-200 hover:text-white',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                Başlık ({lang.toUpperCase()})
              </span>
              <input
                value={form[`title_${lang}` as keyof NotificationFormState]}
                onChange={(e) => update(`title_${lang}` as keyof NotificationFormState, e.target.value)}
                placeholder={`Başlık (${lang})`}
                required
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-accent-500 placeholder:text-panel-200"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                İçerik ({lang.toUpperCase()})
              </span>
              <textarea
                value={form[`body_${lang}` as keyof NotificationFormState]}
                onChange={(e) => update(`body_${lang}` as keyof NotificationFormState, e.target.value)}
                placeholder={`İçerik (${lang})`}
                required
                rows={3}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-accent-500 placeholder:text-panel-200"
              />
              <p className="mt-1 text-xs text-panel-200">
                <code className="rounded bg-white/5 px-1">{'{currency}'}</code> yazarsan kullanıcının
                para birimiyle değiştirilir.
              </p>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                Kategori
              </span>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-panel-800 px-4 py-2.5 text-sm text-white outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                Trigger Tipi
              </span>
              <select
                value={form.trigger_type}
                onChange={(e) => update('trigger_type', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-panel-800 px-4 py-2.5 text-sm text-white outline-none"
              >
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {showTriggerValue && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                  {form.trigger_type === 'fixed_date' ? 'Ayın Günü (1-31)' : 'Gün Sayısı'}
                </span>
                <input
                  type="number"
                  value={form.trigger_value}
                  onChange={(e) => update('trigger_value', e.target.value)}
                  min={0}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-accent-500"
                />
              </label>
            )}

            {showRecurringPattern && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                  Tekrarlama Sıklığı
                </span>
                <select
                  value={form.recurring_pattern}
                  onChange={(e) => update('recurring_pattern', e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-panel-800 px-4 py-2.5 text-sm text-white outline-none"
                >
                  <option value="">Seçiniz</option>
                  <option value="daily">Günlük</option>
                  <option value="weekly">Haftalık</option>
                  <option value="monthly">Aylık</option>
                </select>
              </label>
            )}

            {showRecurringDay && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                  Tekrarlama Günü
                </span>
                <input
                  type="number"
                  value={form.recurring_day}
                  onChange={(e) => update('recurring_day', e.target.value)}
                  placeholder={
                    form.recurring_pattern === 'weekly' ? '0=Paz, 6=Cmt' : '1-31'
                  }
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-accent-500"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
                Saat (UTC, 0-23)
              </span>
              <input
                type="number"
                value={form.recurring_hour}
                onChange={(e) => update('recurring_hour', e.target.value)}
                min={0}
                max={23}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-accent-500"
              />
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={props.onClose} type="button">
              İptal
            </Button>
            <Button type="submit" disabled={props.isPending}>
              {props.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Kaydet
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UploadModal(props: { onClose: () => void }) {
  const { pushToast } = useUi();
  const queryClient = useQueryClient();
  const [uploadTab, setUploadTab] = useState<'json' | 'csv'>('json');
  const [jsonText, setJsonText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [isPending, setIsPending] = useState(false);

  const SAMPLE_URL = '/docs/notifications-sample.txt';

  async function handleJsonUpload() {
    setIsPending(true);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const res = await uploadScheduledNotifications(parsed);
      setResult(res);
      await queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] });
    } catch {
      pushToast({ title: 'Yükleme başarısız', description: 'JSON formatı geçersiz veya sunucu hatası.', tone: 'danger' });
    } finally {
      setIsPending(false);
    }
  }

  async function handleCsvUpload() {
    setIsPending(true);
    try {
      const res = await uploadScheduledNotifications({ text: csvText });
      setResult(res);
      await queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] });
    } catch {
      pushToast({ title: 'Yükleme başarısız', description: 'CSV/TXT parse edilemedi veya sunucu hatası.', tone: 'danger' });
    } finally {
      setIsPending(false);
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-panel-900 p-6 shadow-panel max-h-[85vh]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">Toplu Yükle</h3>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl p-2 text-panel-200 hover:bg-white/5"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">
                {result.created} bildirim eklendi, {result.skipped} satır atlandı.
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-danger">
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button className="w-full" onClick={props.onClose}>
              Kapat
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex gap-1 rounded-2xl bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setUploadTab('json')}
                className={cn(
                  'flex-1 rounded-xl py-2 text-sm font-semibold transition',
                  uploadTab === 'json'
                    ? 'bg-accent-500 text-panel-950'
                    : 'text-panel-200 hover:text-white',
                )}
              >
                JSON Yükle
              </button>
              <button
                type="button"
                onClick={() => setUploadTab('csv')}
                className={cn(
                  'flex-1 rounded-xl py-2 text-sm font-semibold transition',
                  uploadTab === 'csv'
                    ? 'bg-accent-500 text-panel-950'
                    : 'text-panel-200 hover:text-white',
                )}
              >
                TXT/CSV Yükle
              </button>
            </div>

            {uploadTab === 'json' ? (
              <div className="space-y-3">
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='[{"title": {"tr": "...", "en": "...", "ru": "..."}, ...}]'
                  rows={10}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-white outline-none focus:border-accent-500 placeholder:text-panel-200"
                />
                <Button className="w-full" onClick={handleJsonUpload} disabled={isPending || !jsonText.trim()}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Gönder
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-panel-200">TXT veya CSV dosyası seç</span>
                  <a
                    href={SAMPLE_URL}
                    download="notifications-sample.txt"
                    className="flex items-center gap-1 text-xs text-accent-300 hover:text-accent-200"
                  >
                    <Download className="h-3 w-3" />
                    Örnek indir
                  </a>
                </div>
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileSelect}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-accent-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-panel-950"
                />
                {csvText && (
                  <p className="text-xs text-panel-200">
                    {csvText.split('\n').length - 1} satır hazır.
                  </p>
                )}
                <Button className="w-full" onClick={handleCsvUpload} disabled={isPending || !csvText.trim()}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Yükle
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const queryClient = useQueryClient();
  const { pushToast } = useUi();
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduledNotification | null>(null);

  const listQuery = useQuery({
    queryKey: ['scheduled-notifications', page],
    queryFn: () => getScheduledNotifications({ page, limit: 25 }),
  });

  useErrorToast(listQuery.error, 'Bildirimler yüklenemedi');

  const saveMutation = useMutation({
    mutationFn: async ({
      payload,
      id,
    }: {
      payload: ReturnType<typeof formStateToPayload>;
      id?: string;
    }) => {
      if (id) {
        return updateScheduledNotification(id, payload);
      }
      return createScheduledNotification(payload);
    },
    onSuccess: () => {
      pushToast({ title: 'Kaydedildi', description: 'Bildirim başarıyla kaydedildi.', tone: 'success' });
      setShowModal(false);
      setEditTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] });
    },
    onError: () => {
      pushToast({ title: 'Kaydetme başarısız', description: 'Bir hata oluştu.', tone: 'danger' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateScheduledNotification(id, { is_active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteScheduledNotification,
    onSuccess: () => {
      pushToast({ title: 'Silindi', description: 'Bildirim silindi.', tone: 'neutral' });
      void queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] });
    },
  });

  const items = listQuery.data?.items ?? [];
  const totalPages = listQuery.data?.totalPages ?? 1;

  return (
    <>
      <div className="mb-4 flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={() => setShowUpload(true)}
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          Toplu Yükle
        </Button>
        <Button
          onClick={() => {
            setEditTarget(null);
            setShowModal(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Bildirim
        </Button>
      </div>

      <Card>
        {listQuery.isPending ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-panel-200" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="mb-3 h-8 w-8 text-panel-200" />
            <p className="text-sm font-semibold text-white">Henüz bildirim yok</p>
            <p className="mt-1 text-sm text-panel-200">
              Yeni bildirim ekle veya toplu yükle.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Başlık (TR)
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Kategori
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Trigger
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Saat
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Durum
                  </th>
                  <th className="py-3 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-white">
                      {item.title.tr}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={CATEGORY_BADGE_TONE[item.category] ?? 'neutral'}>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-panel-200">
                      <span className="block">{TRIGGER_LABELS[item.trigger_type] ?? item.trigger_type}</span>
                      {item.trigger_value != null && (
                        <span className="text-xs text-panel-200">
                          Değer: {item.trigger_value}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-panel-200">
                      {item.recurring_hour}:00 UTC
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() =>
                          toggleMutation.mutate({ id: item._id, is_active: !item.is_active })
                        }
                        className="flex items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-white/5"
                      >
                        {item.is_active ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-panel-200" />
                        )}
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            item.is_active ? 'text-success' : 'text-panel-200',
                          )}
                        >
                          {item.is_active ? 'Aktif' : 'Pasif'}
                        </span>
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditTarget(item);
                            setShowModal(true);
                          }}
                        >
                          Düzenle
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => deleteMutation.mutate(item._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-panel-200">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>

      {showModal && (
        <NotificationModal
          initial={editTarget ?? undefined}
          onClose={() => {
            setShowModal(false);
            setEditTarget(null);
          }}
          onSave={(payload, id) => saveMutation.mutate({ payload, id })}
          isPending={saveMutation.isPending}
        />
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </>
  );
}

function LogsTab() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');

  const logsQuery = useQuery({
    queryKey: ['notification-logs', page, from, to, category],
    queryFn: () =>
      getNotificationLogs({
        page,
        limit: 25,
        from: from || undefined,
        to: to || undefined,
        category: category || undefined,
      }),
  });

  useErrorToast(logsQuery.error, 'Loglar yüklenemedi');

  const summary = logsQuery.data?.summary;
  const items = logsQuery.data?.items ?? [];
  const totalPages = logsQuery.data?.totalPages ?? 1;

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-panel-200">
            Bu ay toplam gönderim
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-white">
            {summary?.monthlySent ?? '—'}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-panel-200">
            Ort. başarı oranı
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-white">
            {summary != null ? `${summary.monthlyAvgSuccessRate}%` : '—'}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-panel-200">
            Ulaşılan kullanıcı
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-white">
            {summary?.monthlyTotalReached ?? '—'}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
            Başlangıç
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="mt-1 block rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
            Bitiş
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="mt-1 block rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-panel-200">
            Kategori
          </span>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="mt-1 block rounded-2xl border border-white/10 bg-panel-800 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="">Tümü</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        {logsQuery.isPending ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-panel-200" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarClock className="mb-3 h-8 w-8 text-panel-200" />
            <p className="text-sm font-semibold text-white">Gönderim logu yok</p>
            <p className="mt-1 text-sm text-panel-200">Henüz bir bildirim gönderilmedi.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Bildirim
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Tarih
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Hedef
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Başarılı
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Başarısız
                  </th>
                  <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Atlanan
                  </th>
                  <th className="py-3 text-xs font-semibold uppercase tracking-widest text-panel-200">
                    Durum
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => {
                  const notif =
                    typeof log.scheduled_notification_id === 'object' &&
                    log.scheduled_notification_id !== null
                      ? log.scheduled_notification_id
                      : null;

                  return (
                    <tr key={log._id} className="border-b border-white/5 last:border-0">
                      <td className="py-3 pr-4 font-semibold text-white">
                        {notif && typeof notif === 'object' && 'title' in notif
                          ? (notif as { title: { tr: string } }).title.tr
                          : String(log.scheduled_notification_id)}
                      </td>
                      <td className="py-3 pr-4 text-panel-200">
                        {new Date(log.sent_at).toLocaleString('tr-TR')}
                      </td>
                      <td className="py-3 pr-4 text-panel-200">{log.target_count}</td>
                      <td className="py-3 pr-4 text-success">{log.success_count}</td>
                      <td className="py-3 pr-4 text-danger">{log.fail_count}</td>
                      <td className="py-3 pr-4 text-panel-200">{log.skipped_count}</td>
                      <td className="py-3">
                        <Badge tone={LOG_STATUS_TONE[log.status] ?? 'neutral'}>
                          {LOG_STATUS_LABEL[log.status] ?? log.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-panel-200">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

export function ScheduledNotificationsPage() {
  const [tab, setTab] = useState<Tab>('notifications');

  return (
    <PageSection
      title="Zamanlanmış Bildirimler"
      subtitle="Kullanıcılara otomatik olarak gönderilecek bildirimleri yönet."
    >
      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-2xl bg-white/5 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
            tab === 'notifications'
              ? 'bg-accent-500 text-panel-950'
              : 'text-panel-200 hover:text-white',
          )}
        >
          <Bell className="h-4 w-4" />
          Bildirimler
        </button>
        <button
          type="button"
          onClick={() => setTab('logs')}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
            tab === 'logs'
              ? 'bg-accent-500 text-panel-950'
              : 'text-panel-200 hover:text-white',
          )}
        >
          <CalendarClock className="h-4 w-4" />
          Gönderim Logları
        </button>
      </div>

      {tab === 'notifications' ? <NotificationsTab /> : <LogsTab />}
    </PageSection>
  );
}
