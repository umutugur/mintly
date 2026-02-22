import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@mintly/shared';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError) {
          if (error.status === 401) {
            return false;
          }

          if (error.code === 'REQUEST_TIMEOUT' || error.code === 'SERVER_UNREACHABLE') {
            return failureCount < 1;
          }
        }

        return failureCount < 2;
      },
      staleTime: 30 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});
