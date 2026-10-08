import { createBrowserRouter } from 'react-router-dom';
import { AppShell, RequireAuth, ErrorBoundary } from './components/AppShell';
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: '/', lazy: () => import('./pages/Landing') },
      { path: '/registro', lazy: () => import('./pages/Register') },
      { path: '/ingresar', lazy: () => import('./pages/Login') },
      { path: '/privacidad', lazy: () => import('./pages/Privacy') },
      { path: '/caja', lazy: () => import('./pages/Pos') },
      {
        element: <RequireAuth />,
        children: [
          { path: '/mi-club', lazy: () => import('./pages/Dashboard') },
          { path: '/recompensas', lazy: () => import('./pages/Rewards') },
          { path: '/historial', lazy: () => import('./pages/History') },
        ],
      },
      { path: '*', lazy: () => import('./pages/NotFound') },
    ],
  },
]);
