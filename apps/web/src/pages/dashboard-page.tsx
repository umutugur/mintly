import {
  Activity,
  BadgeAlert,
  Coins,
  Database,
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, SectionHeading, Skeleton, StatCard } from '../components/ui';
import { getCategoryAnalytics, getOverview, getTransactionsTimeseries } from '../lib/api';
import { formatCompactDate, formatCurrency, formatNumber, formatPercent } from '../lib/utils';
import { PageSection, useErrorToast, useShell } from '../providers';

const pieColors = ['#ff8a3d', '#ffb347', '#23c483', '#6ee7b7', '#7dd3fc', '#a5b4fc'];

export function DashboardPage() {
  const { dateRange } = useShell();
  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: getOverview,
    staleTime: 60_000,
  });
  const timeseriesQuery = useQuery({
    queryKey: ['timeseries', dateRange.from, dateRange.to, 'day'],
    queryFn: () =>
      getTransactionsTimeseries({
        from: dateRange.from,
        to: dateRange.to,
        granularity: 'day',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  });
  const categoriesQuery = useQuery({
    queryKey: ['category-analytics', dateRange.from, dateRange.to, 'expense'],
    queryFn: () =>
      getCategoryAnalytics({
        from: dateRange.from,
        to: dateRange.to,
        type: 'expense',
        limit: 6,
      }),
  });

  useErrorToast(overviewQuery.error, 'Overview failed');
  useErrorToast(timeseriesQuery.error, 'Trend chart failed');
  useErrorToast(categoriesQuery.error, 'Category chart failed');

  const overview = overviewQuery.data;
  const timeseries = timeseriesQuery.data?.buckets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];

  return (
    <>
      <PageSection
        title="Dashboard"
        subtitle="Global product health with finance and engagement KPIs. The topbar date range drives the charts below."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overview ? (
            <>
              <StatCard
                title="Total users"
                value={formatNumber(overview.totalUsers)}
                hint={`${formatNumber(overview.newUsers.last30Days)} joined in 30d`}
                icon={Users}
              />
              <StatCard
                title="Transactions"
                value={formatNumber(overview.totalTransactions)}
                hint={`${overview.avgDailyTransactions.last30Days.toFixed(1)} per day (30d)`}
                icon={Activity}
              />
              <StatCard
                title="Net cashflow"
                value={formatCurrency(overview.net, overview.topCurrencies[0]?.currency ?? 'TRY')}
                hint={`${formatCurrency(overview.totalIncome, overview.topCurrencies[0]?.currency ?? 'TRY')} income`}
                icon={TrendingUp}
                tone={overview.net >= 0 ? 'success' : 'danger'}
              />
              <StatCard
                title="Deleted ratio"
                value={formatPercent(overview.dataQuality.deletedRatio)}
                hint={`${formatNumber(overview.deletedTransactionsCount)} soft-deleted rows`}
                icon={Database}
                tone="warning"
              />
            </>
          ) : (
            <>
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </>
          )}
        </div>
      </PageSection>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <SectionHeading title="Cashflow timeline" subtitle="Income, expense, and net by day." />
          {timeseriesQuery.isLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries}>
                  <CartesianGrid stroke="rgba(213,228,245,0.08)" vertical={false} />
                  <XAxis dataKey="bucketStart" tickFormatter={formatCompactDate} stroke="#9bb2ca" tickLine={false} />
                  <YAxis stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <Tooltip
formatter={(value) =>
  formatCurrency(Number(value ?? 0), overview?.topCurrencies[0]?.currency ?? 'TRY')
}
labelFormatter={(value) => formatCompactDate(String(value ?? ''))}
                    contentStyle={{
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: '#132235',
                    }}
                  />
                  <Line type="monotone" dataKey="income" stroke="#23c483" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="expense" stroke="#f25f5c" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="net" stroke="#ff8a3d" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <SectionHeading title="Top categories" subtitle="Expense share in the active date range." />
          {categoriesQuery.isLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <div className="grid gap-5 md:grid-cols-[1.2fr_1fr] xl:grid-cols-1">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categories} dataKey="total" nameKey="categoryKey" innerRadius={60} outerRadius={90}>
                      {categories.map((entry, index) => (
                        <Cell key={entry.categoryKey} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
formatter={(value) =>
  formatCurrency(Number(value ?? 0), overview?.topCurrencies[0]?.currency ?? 'TRY')
}                      contentStyle={{
                        borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.08)',
                        backgroundColor: '#132235',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                {categories.map((entry, index) => (
                  <div key={entry.categoryKey} className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: pieColors[index % pieColors.length] }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">{entry.categoryKey}</p>
                        <p className="text-xs text-panel-200">{formatPercent(entry.percentOfTotal)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(entry.total, overview?.topCurrencies[0]?.currency ?? 'TRY')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <SectionHeading title="New users" subtitle="Last 7 and 30 days." />
          {overview ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { label: '7d', value: overview.newUsers.last7Days },
                    { label: '30d', value: overview.newUsers.last30Days },
                  ]}
                >
                  <CartesianGrid stroke="rgba(213,228,245,0.08)" vertical={false} />
                  <XAxis dataKey="label" stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 16, backgroundColor: '#132235', border: '1px solid rgba(255,255,255,0.08)' }} />
                  <Bar dataKey="value" fill="#ff8a3d" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Skeleton className="h-48" />
          )}
        </Card>

        <Card>
          <SectionHeading title="Active users" subtitle="DAU, WAU, and MAU." />
          {overview ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { label: 'DAU', value: overview.activeUsers.dau },
                    { label: 'WAU', value: overview.activeUsers.wau },
                    { label: 'MAU', value: overview.activeUsers.mau },
                  ]}
                >
                  <CartesianGrid stroke="rgba(213,228,245,0.08)" vertical={false} />
                  <XAxis dataKey="label" stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 16, backgroundColor: '#132235', border: '1px solid rgba(255,255,255,0.08)' }} />
                  <Bar dataKey="value" fill="#23c483" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Skeleton className="h-48" />
          )}
        </Card>

        <Card>
          <SectionHeading title="Data quality" subtitle="Signals that affect analytics confidence." />
          {overview ? (
            <div className="space-y-3">
              <QualityRow
                icon={BadgeAlert}
                label="Missing category"
                value={formatNumber(overview.dataQuality.missingCategoryCount)}
              />
              <QualityRow
                icon={Coins}
                label="Transfer ratio"
                value={formatPercent(overview.dataQuality.transferRatio)}
              />
              <QualityRow
                icon={PieChartIcon}
                label="Deleted ratio"
                value={formatPercent(overview.dataQuality.deletedRatio)}
              />
              <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Top currencies</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {overview.topCurrencies.map((currency) => (
                    <span key={currency.currency} className="rounded-full bg-white/5 px-3 py-1 text-sm text-white">
                      {currency.currency} · {formatNumber(currency.count)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Skeleton className="h-48" />
          )}
        </Card>
      </div>
    </>
  );
}

function QualityRow(props: { icon: typeof BadgeAlert; label: string; value: string }) {
  const Icon = props.icon;

  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white/5 p-2">
          <Icon className="h-4 w-4 text-panel-100" />
        </div>
        <p className="text-sm font-semibold text-white">{props.label}</p>
      </div>
      <p className="text-sm text-panel-200">{props.value}</p>
    </div>
  );
}
