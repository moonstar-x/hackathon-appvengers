import {
  Link,
  useLocation,
  NavLink,
  Outlet,
  Navigate,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router-dom';
import { useAuth } from '../api/auth-context';
import { Wordmark, Button } from './ui';
export function AppShell() {
  const auth = useAuth();
  const { pathname } = useLocation();
  return (
    <>
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Wordmark />
          <nav aria-label="Principal">
            {auth.token ? (
              <Link className="button secondary" to="/mi-club">
                Mi club ↗
              </Link>
            ) : (
              <Link className="header-login" to="/ingresar">
                Ingresar <span aria-hidden="true">↗</span>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="contenido">
        <Outlet />
      </main>
      <footer className="site-footer">
        <Wordmark />
        <p>Pequeñas compras. Grandes beneficios.</p>
        <div>
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/caja">Acceso caja</Link>
        </div>
        <small>© {new Date().getFullYear()} Farmaenlace · Ecuador</small>
      </footer>
      {auth.token && ['/mi-club', '/recompensas', '/historial'].includes(pathname) && (
        <nav className="bottom-nav" aria-label="Mi cuenta">
          <NavLink to="/mi-club">Mi club</NavLink>
          <NavLink to="/recompensas">Recompensas</NavLink>
          <NavLink to="/historial">Historial</NavLink>
          <Button variant="ghost" onClick={auth.logout}>
            Salir
          </Button>
        </nav>
      )}
    </>
  );
}
export function RequireAuth() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/ingresar" replace />;
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div className="narrow page">
      <h1>Algo salió mal</h1>
      <p>
        {isRouteErrorResponse(error)
          ? 'No encontramos esta página.'
          : 'Intenta cargar la página de nuevo.'}
      </p>
      <Link className="button primary" to="/">
        Volver al inicio
      </Link>
    </div>
  );
}
