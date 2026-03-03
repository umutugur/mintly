import { BellOff, Smartphone, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';

import { Card, DataTable, EmptyState, StatCard } from '../components/ui';
import { getNotificationTokens } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/utils';
import { PageSection, useErrorToast, useShell } from '../providers';

const columnHelper = createColumnHelper<Awaited<ReturnType<typeof getNotificationTokens>>['users'][number]>();

export function NotificationsPage() {
  const { featureFlags } = useShell();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  const tokensQuery = useQuery({
    queryKey: ['notification-health', page],
    queryFn: () =>
      getNotificationTokens({
        hasToken: false,
        page,
        limit: 12,
      }),
  });

  useErrorToast(tokensQuery.error, 'Notification health failed');

  const columns = [
    columnHelper.accessor('email', {
      header: 'User',
      cell: (info) => (
        <div>
          <p className="font-semibold text-white">{info.getValue()}</p>
          <p className="text-xs text-panel-200">{info.row.original.name ?? 'No name'}</p>
        </div>
      ),
    }),
    columnHelper.accessor('tokensCount', {
      header: 'Tokens',
      cell: (info) => formatNumber(info.getValue()),
    }),
    columnHelper.accessor('lastUpdatedAt', {
      header: 'Last updated',
      cell: (info) => formatDateTime(info.getValue()),
    }),
    columnHelper.accessor('platformSplit', {
      header: 'Platform split',
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

  return (
    <>
      <PageSection
        title="Notifications Health"
        subtitle="Safe token visibility for delivery troubleshooting. Raw Expo tokens are never exposed here."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Users with tokens"
            value={formatNumber(summary?.usersWithTokens ?? 0)}
            hint="Any registered Expo token"
            icon={Smartphone}
            tone="success"
          />
          <StatCard
            title="Users missing tokens"
            value={formatNumber(summary?.usersMissingTokens ?? 0)}
            hint="Likely delivery blind spots"
            icon={BellOff}
            tone="warning"
          />
          <StatCard
            title="iOS tokens"
            value={formatNumber(summary?.platformSplit.ios ?? 0)}
            hint="Platform split aggregate"
            icon={Smartphone}
          />
          <StatCard
            title="Android tokens"
            value={formatNumber(summary?.platformSplit.android ?? 0)}
            hint="Platform split aggregate"
            icon={Smartphone}
          />
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
              title="No users are missing tokens"
              description="This filter shows users without registered push tokens. You are clear right now."
            />
          }
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-panel-200">{formatNumber(tokensQuery.data?.total ?? 0)} users missing tokens</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-2xl bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className="text-sm text-panel-200">Page {page}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-2xl bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={page >= (tokensQuery.data?.totalPages ?? 0)}
                >
                  Next
                </button>
              </div>
            </div>
          }
        />

        <Card>
          <h3 className="font-display text-xl font-bold text-white">Troubleshooting notes</h3>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <TriangleAlert className="h-5 w-5 text-warning" />
                <p className="text-sm font-semibold text-white">Expo Go caveat</p>
              </div>
              <p className="mt-2 text-sm text-panel-200">Expo Go may not return a usable token; validate delivery on a real device.</p>
            </div>

            <div className="rounded-2xl bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <TriangleAlert className="h-5 w-5 text-warning" />
                <p className="text-sm font-semibold text-white">Permission checks</p>
              </div>
              <p className="mt-2 text-sm text-panel-200">Verify device permissions and your notification handler before chasing backend issues.</p>
            </div>

            <div className="rounded-2xl bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <TriangleAlert className="h-5 w-5 text-warning" />
                <p className="text-sm font-semibold text-white">Platform split drift</p>
              </div>
              <p className="mt-2 text-sm text-panel-200">Large iOS/Android imbalance can indicate a registration regression in a platform-specific release.</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
