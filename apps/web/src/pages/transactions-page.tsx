import { Download, FileSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';

import { Button, Card, DataTable, EmptyState, Modal } from '../components/ui';
import { getTransactions } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { formatCurrency, formatDateTime, formatNumber } from '../lib/utils';
import { PageSection, useErrorToast, useShell } from '../providers';

const columnHelper = createColumnHelper<Awaited<ReturnType<typeof getTransactions>>['transactions'][number]>();

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const { globalSearch, dateRange, featureFlags } = useShell();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<'income' | 'expense' | ''>('');
  const [kind, setKind] = useState<'normal' | 'transfer' | ''>('');
  const [currency, setCurrency] = useState('');
  const [userId, setUserId] = useState(searchParams.get('userId') ?? '');
  const [categoryKey, setCategoryKey] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [globalSearch, dateRange.from, dateRange.to, type, kind, currency, userId, categoryKey, deleted]);

  const transactionsQuery = useQuery({
    queryKey: [
      'admin-transactions',
      globalSearch,
      dateRange.from,
      dateRange.to,
      page,
      type,
      kind,
      currency,
      userId,
      categoryKey,
      deleted,
    ],
    queryFn: () =>
      getTransactions({
        search: globalSearch || undefined,
        from: dateRange.from,
        to: dateRange.to,
        page,
        limit: 20,
        type: type || undefined,
        kind: kind || undefined,
        currency: currency || undefined,
        userId: userId || undefined,
        categoryKey: categoryKey || undefined,
        deleted,
      }),
  });

  useErrorToast(transactionsQuery.error, 'Transactions failed');

  const columns = [
    columnHelper.accessor('occurredAt', {
      header: 'Occurred',
      cell: (info) => formatDateTime(info.getValue()),
    }),
    columnHelper.accessor((row) => row.user.email, {
      id: 'userEmail',
      header: 'User',
      cell: (info) => (
        <div>
          <p className="font-semibold text-white">{info.getValue()}</p>
          <p className="text-xs text-panel-200">{info.row.original.user.name ?? 'No name'}</p>
        </div>
      ),
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      cell: (info) => <span className="capitalize text-panel-100">{info.getValue()}</span>,
    }),
    columnHelper.accessor('kind', {
      header: 'Kind',
      cell: (info) => <span className="capitalize text-panel-100">{info.getValue()}</span>,
    }),
    columnHelper.accessor('categoryKey', {
      header: 'Category',
      cell: (info) => info.getValue() ?? 'uncategorized',
    }),
    columnHelper.accessor('amount', {
      header: 'Amount',
      cell: (info) => formatCurrency(info.getValue(), info.row.original.currency),
    }),
  ];

  const table = useReactTable({
    data: transactionsQuery.data?.transactions ?? [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedTransaction =
    transactionsQuery.data?.transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;

  function exportCurrentView() {
    const rows = table.getRowModel().rows.map((row) => ({
      occurredAt: formatDateTime(row.original.occurredAt),
      userEmail: row.original.user.email,
      type: row.original.type,
      kind: row.original.kind,
      categoryKey: row.original.categoryKey ?? 'uncategorized',
      amount: row.original.amount,
      currency: row.original.currency,
      description: row.original.description ?? '',
      deleted: row.original.deletedAt ? 'yes' : 'no',
    }));

    downloadCsv(`montly-admin-transactions-page-${page}.csv`, rows);
  }

  return (
    <>
      <PageSection
        title="Transactions"
        subtitle="Global finance records with safe user joins, filters, and client-side CSV export for the visible rows."
        action={
          <Button variant="secondary" onClick={exportCurrentView} disabled={!transactionsQuery.data?.transactions.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      >
        <Card className="mb-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <FilterSelect
              label="Type"
              value={type}
              onChange={(value) => {
                setPage(1);
                setType(value as 'income' | 'expense' | '');
              }}
              options={[
                { value: '', label: 'All' },
                { value: 'income', label: 'Income' },
                { value: 'expense', label: 'Expense' },
              ]}
            />
            <FilterSelect
              label="Kind"
              value={kind}
              onChange={(value) => {
                setPage(1);
                setKind(value as 'normal' | 'transfer' | '');
              }}
              options={[
                { value: '', label: 'All' },
                { value: 'normal', label: 'Normal' },
                { value: 'transfer', label: 'Transfer' },
              ]}
            />

            <FilterInput
              label="Currency"
              value={currency}
              onChange={(value) => {
                setPage(1);
                setCurrency(value);
              }}
              placeholder="TRY"
            />
            <FilterInput
              label="User ID"
              value={userId}
              onChange={(value) => {
                setPage(1);
                setUserId(value);
              }}
              placeholder="Mongo user id"
            />
            <FilterInput
              label="Category key"
              value={categoryKey}
              onChange={(value) => {
                setPage(1);
                setCategoryKey(value);
              }}
              placeholder="food"
            />

            <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-panel-200">
              <span className="text-xs font-semibold uppercase tracking-[0.12em]">Deleted only</span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={deleted}
                  onChange={(event) => {
                    setPage(1);
                    setDeleted(event.target.checked);
                  }}
                />
                <span className="text-white">{deleted ? 'Showing deleted' : 'Showing active rows'}</span>
              </div>
            </label>
          </div>
        </Card>

        <DataTable
          table={table}
          compact={featureFlags.denseTables}
          loading={transactionsQuery.isLoading}
          onRowClick={(row) => setSelectedTransactionId(row.original.id)}
          emptyState={
            <EmptyState
              icon={FileSearch}
              title="No transactions found"
              description="Adjust the filters, topbar search, or date range to bring records into scope."
            />
          }
          footer={
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid gap-3 md:grid-cols-4">
                <SummaryChip label="Count" value={formatNumber(transactionsQuery.data?.totals.countTotal ?? 0)} />
                <SummaryChip
                  label="Income"
                  value={formatCurrency(
                    transactionsQuery.data?.totals.incomeTotal ?? 0,
                    currency || transactionsQuery.data?.transactions[0]?.currency || 'TRY',
                  )}
                />
                <SummaryChip
                  label="Expense"
                  value={formatCurrency(
                    transactionsQuery.data?.totals.expenseTotal ?? 0,
                    currency || transactionsQuery.data?.transactions[0]?.currency || 'TRY',
                  )}
                />
                <SummaryChip
                  label="Net"
                  value={formatCurrency(
                    transactionsQuery.data?.totals.netTotal ?? 0,
                    currency || transactionsQuery.data?.transactions[0]?.currency || 'TRY',
                  )}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-panel-200">Page {page}</span>
                <Button
                  variant="secondary"
                  disabled={page >= (transactionsQuery.data?.totalPages ?? 0)}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          }
        />
      </PageSection>

      <Modal
        open={Boolean(selectedTransactionId)}
        onClose={() => setSelectedTransactionId(null)}
        title="Transaction detail"
        description="Safe admin record view"
      >
        {selectedTransaction ? (
          <div className="grid gap-4 md:grid-cols-2">
            <DetailRow label="User" value={selectedTransaction.user.email} />
            <DetailRow label="User ID" value={selectedTransaction.userId} />
            <DetailRow label="Occurred" value={formatDateTime(selectedTransaction.occurredAt)} />
            <DetailRow label="Created" value={formatDateTime(selectedTransaction.createdAt)} />
            <DetailRow label="Type" value={selectedTransaction.type} />
            <DetailRow label="Kind" value={selectedTransaction.kind} />
            <DetailRow label="Amount" value={formatCurrency(selectedTransaction.amount, selectedTransaction.currency)} />
            <DetailRow label="Currency" value={selectedTransaction.currency} />
            <DetailRow label="Account ID" value={selectedTransaction.accountId} />
            <DetailRow label="Category key" value={selectedTransaction.categoryKey ?? 'uncategorized'} />
            <DetailRow label="Deleted" value={selectedTransaction.deletedAt ? formatDateTime(selectedTransaction.deletedAt) : 'No'} />
            <DetailRow label="Description" value={selectedTransaction.description ?? '—'} />
          </div>
        ) : (
          <p className="text-sm text-panel-200">Select a row to inspect the full record.</p>
        )}
      </Modal>
    </>
  );
}

function FilterInput(props: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="mt-2 block w-full bg-transparent text-white outline-none placeholder:text-panel-200"
      />
    </label>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-2 block w-full bg-transparent text-white outline-none"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryChip(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{props.value}</p>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</p>
      <p className="mt-2 break-all text-sm font-semibold text-white">{props.value}</p>
    </div>
  );
}
