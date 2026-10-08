import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import './styles.css';
import { tenant, applyTheme } from './theme';
import { AuthProvider } from './api/AuthProvider';
import { router } from './router';
applyTheme(tenant);
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
const root = document.getElementById('root');
if (!root) throw new Error('Root missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
