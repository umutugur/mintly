import {
  ChevronDown,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { flexRender, type HeaderGroup, type Row, type Table } from '@tanstack/react-table';
import type { PropsWithChildren, ReactNode } from 'react';

import { cn } from '../lib/utils';

export function Button(
  props: PropsWithChildren<{
    onClick?: () => void;
    type?: 'button' | 'submit';
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    className?: string;
    disabled?: boolean;
  }>,
) {
  const variant = props.variant ?? 'primary';

  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent-500 text-panel-950 hover:bg-accent-400',
        variant === 'secondary' && 'bg-panel-800 text-panel-100 hover:bg-panel-700',
        variant === 'ghost' && 'bg-transparent text-panel-200 hover:bg-white/5',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

export function Card(props: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-white/10 bg-panel-900/80 p-5 shadow-panel backdrop-blur',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

export function Badge(props: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'danger' | 'warning'; className?: string }>) {
  const tone = props.tone ?? 'neutral';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
        tone === 'neutral' && 'bg-white/6 text-panel-200',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'warning' && 'bg-warning/15 text-warning',
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}

export function SectionHeading(props: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="font-display text-xl font-bold text-white">{props.title}</h2>
        {props.subtitle ? <p className="mt-1 text-sm text-panel-200">{props.subtitle}</p> : null}
      </div>
      {props.action}
    </div>
  );
}

export function Skeleton(props: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-white/6', props.className)} />;
}

export function EmptyState(props: { title: string; description: string; icon: LucideIcon }) {
  const Icon = props.icon;

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-panel-900/50 px-6 py-12 text-center">
      <div className="rounded-2xl bg-white/5 p-4">
        <Icon className="h-6 w-6 text-panel-100" />
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-white">{props.title}</h3>
      <p className="mt-2 max-w-md text-sm text-panel-200">{props.description}</p>
    </div>
  );
}

export function StatCard(props: {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
}) {
  const Icon = props.icon;
  const tone = props.tone ?? 'neutral';

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-panel-200">{props.title}</p>
          <p className="mt-3 font-display text-3xl font-bold text-white">{props.value}</p>
          {props.hint ? <p className="mt-2 text-sm text-panel-200">{props.hint}</p> : null}
        </div>
        <div
          className={cn(
            'rounded-2xl p-3',
            tone === 'neutral' && 'bg-white/6 text-panel-100',
            tone === 'success' && 'bg-success/15 text-success',
            tone === 'danger' && 'bg-danger/15 text-danger',
            tone === 'warning' && 'bg-warning/15 text-warning',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function Modal(props: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  size?: 'md' | 'xl';
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-panel-950/80 p-4 backdrop-blur-sm">
      <div
        className={cn(
          'w-full rounded-3xl border border-white/10 bg-panel-900 p-6 shadow-panel',
          props.size === 'xl' ? 'max-w-5xl' : 'max-w-xl',
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">{props.title}</h3>
            {props.description ? <p className="mt-1 text-sm text-panel-200">{props.description}</p> : null}
          </div>
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function Drawer(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-40 transition',
        props.open ? 'pointer-events-auto bg-panel-950/70' : 'pointer-events-none bg-transparent',
      )}
    >
      <button
        type="button"
        aria-label="Close drawer"
        onClick={props.onClose}
        className="absolute inset-0"
      />
      <aside
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-xl border-l border-white/10 bg-panel-900 p-6 shadow-panel transition-transform',
          props.open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">{props.title}</h3>
            {props.subtitle ? <p className="mt-1 text-sm text-panel-200">{props.subtitle}</p> : null}
          </div>
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
        </div>
        <div className="h-[calc(100%-52px)] overflow-y-auto pr-1">{props.children}</div>
      </aside>
    </div>
  );
}

export function DataTable<TData>(props: {
  table: Table<TData>;
  onRowClick?: (row: Row<TData>) => void;
  footer?: ReactNode;
  loading?: boolean;
  emptyState?: ReactNode;
  compact?: boolean;
}) {
  const rows = props.table.getRowModel().rows;

  if (props.loading) {
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return props.emptyState ?? null;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-panel-200">
          <thead className="bg-white/[0.03]">
            {props.table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'font-semibold text-panel-100',
                      props.compact ? 'px-4 py-2.5' : 'px-4 py-3',
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-2"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() ? <ChevronDown className="h-4 w-4 opacity-60" /> : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => props.onRowClick?.(row)}
                className={cn(
                  'border-t border-white/6 transition',
                  props.onRowClick && 'cursor-pointer hover:bg-white/[0.03]',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn('align-top', props.compact ? 'px-4 py-2.5' : 'px-4 py-3')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.footer ? <div className="border-t border-white/6 bg-white/[0.02] px-4 py-3">{props.footer}</div> : null}
    </Card>
  );
}

export function InlineLoader(props: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-panel-200">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      <span>{props.label}</span>
    </div>
  );
}
