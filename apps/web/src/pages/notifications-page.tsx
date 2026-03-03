import { BellOff, Send, Smartphone, TriangleAlert, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Button, Card, DataTable, EmptyState, StatCard } from '../components/ui';
import { adminSendNotification, getNotificationTokens, getUsers } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/utils';
import { PageSection, useErrorToast, useShell, useUi } from '../providers';

const columnHelper = createColumnHelper<Awaited<ReturnType<typeof getNotificationTokens>>['users'][number]>();

type NotificationTarget = 'all' | 'hasToken' | 'users';

export function NotificationsPage() {
  const { featureFlags } = useShell();
  const { pushToast } = useUi();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<NotificationTarget>('hasToken');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Array<{ id: string; email: string; name: string | null }>>([]);

  const tokensQuery = useQuery({
    queryKey: ['notification-health', page],
    queryFn: () =>
      getNotificationTokens({
        hasToken: false,
        page,
        limit: 12,
      }),
  });

  const userSearchQuery = useQuery({
    queryKey: ['notification-user-search', userSearch],
    queryFn: () =>
      getUsers({
        search: userSearch || undefined,
        page: 1,
        limit: 8,
      }),
    enabled: target === 'users' && userSearch.trim().length >= 2,
    staleTime: 15_000,
  });

  const sendMutation = useMutation({
    mutationFn: adminSendNotification,
    onSuccess: (result) => {
      pushToast({
        title: 'Bildirim gönderildi',
        description: `${formatNumber(result.sent)} gönderim kuyruğa alındı. Tokenı olmayan ${formatNumber(result.noToken)} kullanıcı atlandı.`,
        tone: 'success',
      });
      setTitle('');
      setBody('');
      setTarget('hasToken');
      setUserSearch('');
      setSelectedUsers([]);
    },
  });

  useErrorToast(tokensQuery.error, 'Bildirim sağlığı alınamadı');
  useErrorToast(userSearchQuery.error, 'Kullanıcı araması başarısız');
  useErrorToast(sendMutation.error, 'Bildirim gönderilemedi');

  const columns = [
    columnHelper.accessor('email', {
      header: 'Kullanıcı',
      cell: (info) => (
        <div>
          <p className="font-semibold text-white">{info.getValue()}</p>
          <p className="text-xs text-panel-200">{info.row.original.name ?? 'İsim yok'}</p>
        </div>
      ),
    }),
    columnHelper.accessor('tokensCount', {
      header: 'Token',
      cell: (info) => formatNumber(info.getValue()),
    }),
    columnHelper.accessor('lastUpdatedAt', {
      header: 'Son güncelleme',
      cell: (info) => formatDateTime(info.getValue()),
    }),
    columnHelper.accessor('platformSplit', {
      header: 'Platform dağılımı',
      cell: (info) => `iOS ${info.getValue().ios} / Android ${info.getValue().android}`,
    }),
  ];

  const table = useReactTable({
    data: tokensQuery.data?.users ?? [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const summary = tokensQuery.data?.summary;
  const searchResults = useMemo(
    () =>
      (userSearchQuery.data?.users ?? []).filter(
        (user) => !selectedUsers.some((selected) => selected.id === user.id),
      ),
    [selectedUsers, userSearchQuery.data?.users],
  );

  function toggleSelectedUser(user: { id: string; email: string; name: string | null }) {
    setSelectedUsers((current) => {
      if (current.some((entry) => entry.id === user.id)) {
        return current.filter((entry) => entry.id !== user.id);
      }

      return [...current, user];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await sendMutation.mutateAsync({
      title,
      body,
      target,
      userIds: target === 'users' ? selectedUsers.map((user) => user.id) : undefined,
    });
  }

  return (
    <>
      <PageSection
        title="Bildirim Gönder"
        subtitle="Toplu push gönderimi ve token sağlığı görünümü aynı ekranda. Ham Expo token değerleri yine gösterilmez."
      >
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Başlık</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={120}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none"
                    placeholder="Örn. Yeni kampanyalar hazır"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Mesaj</span>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    required
                    maxLength={1000}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none"
                    placeholder="Kısa ve net bir gövde metni yazın."
                  />
                </label>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Hedef</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <TargetRadio
                    label="Tüm kullanıcılara"
                    checked={target === 'all'}
                    onChange={() => setTarget('all')}
                  />
                  <TargetRadio
                    label="Token'ı olanlara"
                    checked={target === 'hasToken'}
                    onChange={() => setTarget('hasToken')}
                  />
                  <TargetRadio
                    label="Seçili kullanıcılara"
                    checked={target === 'users'}
                    onChange={() => setTarget('users')}
                  />
                </div>
              </div>

              {target === 'users' ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">E-posta ile ara</span>
                    <input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none"
                      placeholder="kullanici@ornek.com"
                    />
                  </label>

                  <div className="mt-4 space-y-2">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleSelectedUser(user)}
                        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 text-left"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{user.email}</p>
                          <p className="text-xs text-panel-200">{user.name ?? 'İsim yok'}</p>
                        </div>
                        <Users className="h-4 w-4 text-panel-200" />
                      </button>
                    ))}
                    {userSearch.trim().length >= 2 && searchResults.length === 0 && !userSearchQuery.isLoading ? (
                      <p className="text-sm text-panel-200">Arama sonucu bulunamadı.</p>
                    ) : null}
                  </div>

                  {selectedUsers.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => toggleSelectedUser(user)}
                          className="rounded-full bg-accent-500/15 px-3 py-1 text-sm font-semibold text-accent-300"
                        >
                          {user.email}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-panel-200">Henüz kullanıcı seçilmedi.</p>
                  )}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-panel-200">
                  Token'ı olmayan kullanıcılar otomatik atlanır; endpoint hata fırlatmaz.
                </p>
                <Button
                  type="submit"
                  disabled={
                    sendMutation.isPending || (target === 'users' && selectedUsers.length === 0)
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  {sendMutation.isPending ? 'Gönderiliyor...' : 'Bildirimi Gönder'}
                </Button>
              </div>
            </form>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            <StatCard
              title="Token'ı olan kullanıcı"
              value={formatNumber(summary?.usersWithTokens ?? 0)}
              hint="En az bir Expo token kaydı var"
              icon={Smartphone}
              tone="success"
            />
            <StatCard
              title="Token'ı olmayan kullanıcı"
              value={formatNumber(summary?.usersMissingTokens ?? 0)}
              hint="Gönderimde otomatik skip"
              icon={BellOff}
              tone="warning"
            />
            <StatCard
              title="iOS token"
              value={formatNumber(summary?.platformSplit.ios ?? 0)}
              hint="Toplam kayıt"
              icon={Smartphone}
            />
            <StatCard
              title="Android token"
              value={formatNumber(summary?.platformSplit.android ?? 0)}
              hint="Toplam kayıt"
              icon={Smartphone}
            />
          </div>
        </div>
      </PageSection>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <DataTable
          table={table}
          compact={featureFlags.denseTables}
          loading={tokensQuery.isLoading}
          emptyState={
            <EmptyState
              icon={BellOff}
              title="Token eksik kullanıcı yok"
              description="Bu filtre, push token'ı eksik kullanıcıları gösterir. Şu anda görünür bir eksik yok."
            />
          }
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-panel-200">
                {formatNumber(tokensQuery.data?.total ?? 0)} kullanıcı token bekliyor
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-2xl bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={page <= 1}
                >
                  Geri
                </button>
                <span className="text-sm text-panel-200">Sayfa {page}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-2xl bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={page >= (tokensQuery.data?.totalPages ?? 0)}
                >
                  İleri
                </button>
              </div>
            </div>
          }
        />

        <Card>
          <h3 className="font-display text-xl font-bold text-white">Kontrol notları</h3>
          <div className="mt-5 space-y-4">
            <NoteCard
              title="Expo Go kısıtı"
              description="Expo Go her zaman kullanılabilir push token dönmeyebilir; gerçek cihazda test edin."
            />
            <NoteCard
              title="İzin ve handler"
              description="İzinler, foreground handler ve native yapılandırma eksikse backend sağlıklı olsa bile teslimat düşer."
            />
            <NoteCard
              title="Platform dengesizliği"
              description="iOS/Android oranındaki sert kaymalar, platforma özel bir release regresyonuna işaret edebilir."
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function TargetRadio(props: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <input type="radio" checked={props.checked} onChange={props.onChange} />
      <span className="text-sm font-semibold text-white">{props.label}</span>
    </label>
  );
}

function NoteCard(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <TriangleAlert className="h-5 w-5 text-warning" />
        <p className="text-sm font-semibold text-white">{props.title}</p>
      </div>
      <p className="mt-2 text-sm text-panel-200">{props.description}</p>
    </div>
  );
}
