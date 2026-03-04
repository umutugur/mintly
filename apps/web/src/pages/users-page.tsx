import { ArrowRight, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';

import { Badge, Button, Card, DataTable, Drawer, EmptyState, SectionHeading } from '../components/ui';
import { getUserDetail, getUsers } from '../lib/api';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../lib/utils';
import { PageSection, useErrorToast, useShell } from '../providers';

const columnHelper = createColumnHelper<Awaited<ReturnType<typeof getUsers>>['users'][number]>();

export function UsersPage() {
  const navigate = useNavigate();
  const { globalSearch, dateRange, featureFlags } = useShell();
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('');
  const [provider, setProvider] = useState<'google' | 'apple' | 'none' | ''>('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [globalSearch, dateRange.from, dateRange.to, status, provider]);

  const usersQuery = useQuery({
    queryKey: ['admin-users', globalSearch, dateRange.from, dateRange.to, status, provider, page],
    queryFn: () =>
      getUsers({
        search: globalSearch || undefined,
        from: dateRange.from,
        to: dateRange.to,
        status: status || undefined,
        provider: provider || undefined,
        page,
        limit: 12,
      }),
  });

  const usersTotalPages = Math.max(1, usersQuery.data?.totalPages ?? 1);

  useEffect(() => {
    if (page > usersTotalPages) {
      setPage(usersTotalPages);
    }
  }, [page, usersTotalPages]);

  const detailQuery = useQuery({
    queryKey: ['admin-user-detail', selectedUserId],
    queryFn: () => getUserDetail(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  useErrorToast(usersQuery.error, 'Users failed');
  useErrorToast(detailQuery.error, 'User detail failed');

  const columns = [
    columnHelper.accessor('email', {
      header: 'Email',
      cell: (info) => (
        <div>
          <p className="font-semibold text-white">{info.getValue()}</p>
          <p className="text-xs text-panel-200">{info.row.original.name ?? 'No display name'}</p>
        </div>
      ),
    }),
    columnHelper.accessor('providers', {
      header: 'Providers',
      cell: (info) => (
        <div className="flex flex-wrap gap-2">
          {info.getValue().length > 0 ? (
            info.getValue().map((providerName) => <Badge key={providerName}>{providerName}</Badge>)
          ) : (
            <Badge tone="warning">none</Badge>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('isActive', {
      header: 'Active',
      cell: (info) => (
        <Badge tone={info.getValue() ? 'success' : 'warning'}>
          {info.getValue() ? 'Active' : 'Inactive'}
        </Badge>
      ),
    }),
    columnHelper.accessor('notificationsEnabled', {
      header: 'Notifications',
      cell: (info) => (
        <span className="text-sm text-panel-100">{info.getValue() ? 'Enabled' : 'Muted'}</span>
      ),
    }),
    columnHelper.accessor('expoPushTokensCount', {
      header: 'Tokens',
      cell: (info) => formatNumber(info.getValue()),
    }),
  ];

  const table = useReactTable({
    data: usersQuery.data?.users ?? [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedUser = detailQuery.data?.user ?? null;

  return (
    <>
      <PageSection
        title="Users"
        subtitle="Search is shared from the topbar. Date range filters by signup date for this screen."
      >
        <Card className="mb-6">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Status</span>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value as 'active' | 'inactive' | '');
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Provider</span>
              <select
                value={provider}
                onChange={(event) => {
                  setPage(1);
                  setProvider(event.target.value as 'google' | 'apple' | 'none' | '');
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none"
              >
                <option value="">All</option>
                <option value="google">Google</option>
                <option value="apple">Apple</option>
                <option value="none">None</option>
              </select>
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Topbar search</p>
              <p className="mt-2 text-sm text-white">{globalSearch || 'No search keyword applied'}</p>
            </div>
          </div>
        </Card>

        <DataTable
          table={table}
          compact={featureFlags.denseTables}
          loading={usersQuery.isLoading}
          onRowClick={(row) => setSelectedUserId(row.original.id)}
          emptyState={
            <EmptyState
              icon={SearchX}
              title="No users matched"
              description="Try widening the date range, clearing the topbar search, or changing the provider filter."
            />
          }
          footer={
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-panel-200">
                {formatNumber(usersQuery.data?.total ?? 0)} total users
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1 || usersQuery.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-panel-200">Page {page} / {usersTotalPages}</span>
                <Button
                  variant="secondary"
                  disabled={page >= usersTotalPages || usersQuery.isFetching}
                  onClick={() => setPage((current) => Math.min(usersTotalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          }
        />
      </PageSection>

      <Drawer
        open={Boolean(selectedUserId)}
        onClose={() => setSelectedUserId(null)}
        title={selectedUser?.name ?? selectedUser?.email ?? 'User detail'}
        subtitle={selectedUser?.email ?? 'Loading safe user detail'}
      >
        {detailQuery.isLoading ? (
          <Card>
            <p className="text-sm text-panel-200">Loading user detail…</p>
          </Card>
        ) : !selectedUser ? (
          <Card>
            <p className="text-sm text-panel-200">The selected user could not be found.</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <SectionHeading title="Profile summary" subtitle="Safe admin view with no password hashes or raw tokens." />
              <div className="grid gap-4 md:grid-cols-2">
                <InfoRow label="Created" value={formatDateTime(selectedUser.createdAt)} />
                <InfoRow label="Last active" value={formatDateTime(selectedUser.activity.lastActiveAt)} />
                <InfoRow label="Providers" value={selectedUser.providers.join(', ') || 'None'} />
                <InfoRow label="Notifications" value={selectedUser.notificationsEnabled ? 'Enabled' : 'Muted'} />
                <InfoRow label="Base currency" value={selectedUser.baseCurrency ?? 'Not set'} />
                <InfoRow label="Risk profile" value={selectedUser.riskProfile} />
              </div>
            </Card>

            <Card>
              <SectionHeading title="Activity snapshot" subtitle="Lifecycle and transaction footprint." />
              <div className="grid gap-4 md:grid-cols-2">
                <InfoRow label="Transactions" value={formatNumber(selectedUser.transactionStats.count)} />
                <InfoRow label="Last transaction" value={formatDateTime(selectedUser.transactionStats.lastTransactionAt)} />
                <InfoRow label="Currencies used" value={selectedUser.transactionStats.currenciesUsed.join(', ') || '—'} />
                <InfoRow label="Transfer ratio" value={`${Math.round(selectedUser.transactionStats.transferRatio * 100)}%`} />
                <InfoRow
                  label="Income"
                  value={formatCurrency(selectedUser.transactionStats.incomeTotal, selectedUser.baseCurrency)}
                />
                <InfoRow
                  label="Expense"
                  value={formatCurrency(selectedUser.transactionStats.expenseTotal, selectedUser.baseCurrency)}
                />
              </div>
            </Card>

            <Card>
              <SectionHeading title="Notification summary" subtitle="Token counts only, no raw device tokens." />
              <div className="grid gap-4 md:grid-cols-2">
                <InfoRow label="Tokens count" value={formatNumber(selectedUser.notificationSummary.tokensCount)} />
                <InfoRow label="Last updated" value={formatDateTime(selectedUser.notificationSummary.lastUpdatedAt)} />
                <InfoRow label="iOS tokens" value={formatNumber(selectedUser.notificationSummary.platformSplit.ios)} />
                <InfoRow
                  label="Android tokens"
                  value={formatNumber(selectedUser.notificationSummary.platformSplit.android)}
                />
              </div>
            </Card>

            <Button
              className="w-full"
              onClick={() => {
                navigate(`/transactions?userId=${selectedUser.id}`);
                setSelectedUserId(null);
              }}
            >
              <span>View user transactions</span>
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{props.value}</p>
    </div>
  );
}
