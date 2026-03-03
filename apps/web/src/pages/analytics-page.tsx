import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, SectionHeading, Skeleton } from '../components/ui';
import {
  getCategoryAnalytics,
  getOverview,
  getRetention,
  getTransactionsTimeseries,
} from '../lib/api';
import {
  formatCompactDate,
  formatCurrency,
  formatNumber,
  formatPercent,
  previousDateRange,
} from '../lib/utils';
import { PageSection, useErrorToast, useShell } from '../providers';

export function AnalyticsPage() {
  const { dateRange, featureFlags } = useShell();
  const previousRange = previousDateRange(dateRange);

  const overviewQuery = useQuery({
    queryKey: ['overview'],
    queryFn: getOverview,
    staleTime: 60_000,
  });
  const currentTimeseriesQuery = useQuery({
    queryKey: ['analytics-current-timeseries', dateRange.from, dateRange.to],
    queryFn: () =>
      getTransactionsTimeseries({
        from: dateRange.from,
        to: dateRange.to,
        granularity: 'week',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  });
  const previousTimeseriesQuery = useQuery({
    queryKey: ['analytics-previous-timeseries', previousRange.from, previousRange.to],
    queryFn: () =>
      getTransactionsTimeseries({
        from: previousRange.from,
        to: previousRange.to,
        granularity: 'week',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  });
  const categoriesQuery = useQuery({
    queryKey: ['analytics-categories', dateRange.from, dateRange.to],
    queryFn: () =>
      getCategoryAnalytics({
        from: dateRange.from,
        to: dateRange.to,
        type: 'expense',
        limit: 8,
      }),
  });
  const retentionQuery = useQuery({
    queryKey: ['analytics-retention', dateRange.from, dateRange.to],
    queryFn: () =>
      getRetention({
        cohort: 'monthly',
        from: dateRange.from,
        to: dateRange.to,
      }),
  });

  useErrorToast(overviewQuery.error, 'Analytics overview failed');
  useErrorToast(currentTimeseriesQuery.error, 'Current cashflow failed');
  useErrorToast(previousTimeseriesQuery.error, 'Previous cashflow failed');
  useErrorToast(categoriesQuery.error, 'Category intelligence failed');
  useErrorToast(retentionQuery.error, 'Retention failed');

  const overview = overviewQuery.data;
  const currentBuckets = currentTimeseriesQuery.data?.buckets ?? [];
  const previousBuckets = previousTimeseriesQuery.data?.buckets ?? [];
  const comparison = currentBuckets.map((bucket, index) => ({
    label: formatCompactDate(bucket.bucketStart),
    currentNet: bucket.net,
    previousNet: previousBuckets[index]?.net ?? 0,
    currentExpense: bucket.expense,
    currentIncome: bucket.income,
  }));
  const categories = categoriesQuery.data?.categories ?? [];
  const sortedByGrowth = [...categories].sort((left, right) => right.changePercent - left.changePercent).slice(0, 3);
  const volatilityProxy = [...categories]
    .map((entry) => ({
      ...entry,
      volatilityScore: Math.abs(entry.changePercent) * Math.max(entry.percentOfTotal, 0.05),
    }))
    .sort((left, right) => right.volatilityScore - left.volatilityScore)
    .slice(0, 3);
  const currentNetTotal = currentBuckets.reduce((sum, bucket) => sum + bucket.net, 0);
  const previousNetTotal = previousBuckets.reduce((sum, bucket) => sum + bucket.net, 0);
  const netDelta = currentNetTotal - previousNetTotal;

  return (
    <>
      <PageSection
        title="Analytics"
        subtitle="Richer aggregate insights. The current topbar range powers the current-period sections and compares against the prior equal-length period."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <SectionHeading title="Cashflow trends" subtitle="Current net vs previous period, grouped weekly." />
            {currentTimeseriesQuery.isLoading || previousTimeseriesQuery.isLoading ? (
              <Skeleton className="h-80" />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Metric label="Current net" value={formatCurrency(currentNetTotal, overview?.topCurrencies[0]?.currency ?? 'TRY')} />
                  <Metric label="Previous net" value={formatCurrency(previousNetTotal, overview?.topCurrencies[0]?.currency ?? 'TRY')} />
                  <Metric
                    label="Delta"
                    value={formatCurrency(netDelta, overview?.topCurrencies[0]?.currency ?? 'TRY')}
                  />
                </div>
                <div className="mt-5 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparison}>
                      <CartesianGrid stroke="rgba(213,228,245,0.08)" vertical={false} />
                      <XAxis dataKey="label" stroke="#9bb2ca" tickLine={false} axisLine={false} />
                      <YAxis stroke="#9bb2ca" tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          backgroundColor: '#132235',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      />
                      <Line type="monotone" dataKey="currentNet" stroke="#ff8a3d" strokeWidth={3} dot={featureFlags.animatedCharts} />
                      <Line type="monotone" dataKey="previousNet" stroke="#7dd3fc" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Card>

          <Card>
            <SectionHeading title="Category intelligence" subtitle="Growth, mix share, and volatility proxy." />
            {categoriesQuery.isLoading ? (
              <Skeleton className="h-80" />
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <InsightList
                    title="Fastest growing expense categories"
                    rows={sortedByGrowth.map((entry) => ({
                      label: entry.categoryKey,
                      value: `${entry.changePercent.toFixed(1)}%`,
                      hint: `${formatCurrency(entry.total, overview?.topCurrencies[0]?.currency ?? 'TRY')} current`,
                    }))}
                  />
                  <InsightList
                    title="Volatility proxy"
                    rows={volatilityProxy.map((entry) => ({
                      label: entry.categoryKey,
                      value: entry.volatilityScore.toFixed(1),
                      hint: `Δ ${formatCurrency(entry.trendVsPreviousPeriod, overview?.topCurrencies[0]?.currency ?? 'TRY')}`,
                    }))}
                  />
                </div>

                <div className="grid gap-3">
                  {categories.slice(0, 5).map((entry) => (
                    <div
                      key={entry.categoryKey}
                      className={`rounded-2xl bg-white/[0.03] px-4 py-3 ${
                        featureFlags.highlightSignals ? 'ring-1 ring-accent-500/15' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{entry.categoryKey}</p>
                        <p className="text-sm text-panel-200">{formatPercent(entry.percentOfTotal)}</p>
                      </div>
                      <p className="mt-2 text-xs text-panel-200">
                        {entry.categoryKey} increased by {entry.changePercent.toFixed(1)}% vs the previous period.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </PageSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeading title="User engagement" subtitle="DAU/WAU/MAU, activation, and simplified retention." />
          {overview ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Metric label="DAU" value={formatNumber(overview.activeUsers.dau)} />
                <Metric label="WAU" value={formatNumber(overview.activeUsers.wau)} />
                <Metric label="MAU" value={formatNumber(overview.activeUsers.mau)} />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Activation funnel</p>
                  <p className="mt-3 text-sm text-white">
                    Signups in 30d: {formatNumber(overview.activationFunnel.signupsLast30Days)}
                  </p>
                  <p className="mt-2 text-sm text-white">
                    Reached first transaction: {formatNumber(overview.activationFunnel.usersWithFirstTransactionLast30Days)}
                  </p>
                  <p className="mt-2 text-sm text-white">
                    Conversion: {formatPercent(overview.activationFunnel.conversionRate)}
                  </p>
                  <p className="mt-2 text-sm text-white">
                    Median days to first transaction: {overview.activationFunnel.medianDaysToFirstTransaction.toFixed(0)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Simplified retention</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-panel-200">
                      <thead>
                        <tr className="text-panel-100">
                          <th className="pb-2 pr-3">Cohort</th>
                          <th className="pb-2 pr-3">Size</th>
                          <th className="pb-2 pr-3">+1</th>
                          <th className="pb-2">+2</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(retentionQuery.data?.cohorts ?? []).slice(0, 4).map((row) => (
                          <tr key={row.cohortStart} className="border-t border-white/6">
                            <td className="py-2 pr-3">{formatCompactDate(row.cohortStart)}</td>
                            <td className="py-2 pr-3">{row.cohortSize}</td>
                            <td className="py-2 pr-3">{formatPercent(row.retainedRates.retained_1)}</td>
                            <td className="py-2">{formatPercent(row.retainedRates.retained_2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Skeleton className="h-72" />
          )}
        </Card>

        <Card>
          <SectionHeading title="Behavior segments" subtitle="Transfer-heavy, multi-currency, and dormant users." />
          {overview ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Metric
                label="Transfer-heavy users"
                value={formatPercent(overview.behaviorSegments.transferHeavyUsersRatio)}
                hint={`${formatNumber(overview.behaviorSegments.transferHeavyUsersCount)} users`}
              />
              <Metric
                label="Multi-currency users"
                value={formatPercent(overview.behaviorSegments.multiCurrencyUsersRatio)}
                hint={`${formatNumber(overview.behaviorSegments.multiCurrencyUsersCount)} users`}
              />
              <Metric
                label="No transactions after signup"
                value={formatPercent(overview.behaviorSegments.usersWithoutTransactionsRatio)}
                hint={`${formatNumber(overview.behaviorSegments.usersWithoutTransactionsCount)} users`}
              />
            </div>
          ) : (
            <Skeleton className="h-72" />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Card>
          <SectionHeading title="Financial health signals" subtitle="Aggregate signals only, not financial advice." />
          {overview ? (
            <div className="space-y-5">
              <Metric
                label="Average savings rate proxy"
                value={formatPercent(overview.financialSignals.averageSavingsRateProxy)}
              />

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.financialSignals.expenseToIncomeDistribution}>
                    <CartesianGrid stroke="rgba(213,228,245,0.08)" vertical={false} />
                    <XAxis dataKey="label" stroke="#9bb2ca" tickLine={false} axisLine={false} />
                    <YAxis stroke="#9bb2ca" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 16,
                        backgroundColor: '#132235',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    />
                    <Bar dataKey="count" fill="#23c483" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <Skeleton className="h-80" />
          )}
        </Card>

        <Card>
          <SectionHeading title="Median net by month" subtitle="Median user net across the last available monthly buckets." />
          {overview ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.financialSignals.medianNetByMonth}>
                  <CartesianGrid stroke="rgba(213,228,245,0.08)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={formatCompactDate} stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <YAxis stroke="#9bb2ca" tickLine={false} axisLine={false} />
                  <Tooltip
formatter={(value) =>
  formatCurrency(Number(value ?? 0), overview.topCurrencies[0]?.currency ?? 'TRY')}                    
labelFormatter={(value) => formatCompactDate(String(value ?? ''))}
                    contentStyle={{
                      borderRadius: 16,
                      backgroundColor: '#132235',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                  <Line type="monotone" dataKey="medianNet" stroke="#ff8a3d" strokeWidth={3} dot={featureFlags.animatedCharts} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Skeleton className="h-80" />
          )}
        </Card>
      </div>
    </>
  );
}

function Metric(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-white">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-panel-200">{props.hint}</p> : null}
    </div>
  );
}

function InsightList(props: {
  title: string;
  rows: Array<{ label: string; value: string; hint: string }>;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.title}</p>
      <div className="mt-4 space-y-3">
        {props.rows.map((row) => (
          <div key={row.label} className="rounded-2xl bg-white/[0.03] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{row.label}</p>
              <p className="text-sm text-panel-100">{row.value}</p>
            </div>
            <p className="mt-1 text-xs text-panel-200">{row.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
