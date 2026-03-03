import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './app';
import { AuthProvider, ShellProvider, UiProvider } from './providers';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <UiProvider>
        <ShellProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ShellProvider>
      </UiProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
