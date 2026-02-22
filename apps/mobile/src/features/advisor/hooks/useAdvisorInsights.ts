import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import { useI18n } from '@shared/i18n';

export function useAdvisorInsights(month: string) {
  const { withAuth } = useAuth();
  const { locale } = useI18n();

  return useQuery({
    queryKey: financeQueryKeys.ai.advisorInsights(month, locale),
    queryFn: () =>
      withAuth((token) =>
        apiClient.getAdvisorInsights(
          {
            month,
            language: locale,
            regenerate: false,
          },
          token,
        ),
      ),
  });
}
