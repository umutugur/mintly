import type { QueryClient } from '@tanstack/react-query';

import { financeQueryKeys } from './queryKeys';

export async function invalidateFinanceQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.recurring.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.ai.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.reports.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.budgets.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.upcomingPayments.all() }),
    queryClient.invalidateQueries({ queryKey: financeQueryKeys.groups.all() }),
    queryClient.invalidateQueries({ queryKey: ['me', 'preferences'] }),
  ]);
}
