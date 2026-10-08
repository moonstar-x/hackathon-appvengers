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
import { useState } from 'react';
import { Wordmark, Button } from './ui';
// Landing section anchors shown in the header (smartclub.ec-style navbar).
const sections = [
  ['#como-funciona', 'Cómo funciona'],
  ['#ligas', 'Ligas'],
  ['#marcas', 'Marcas'],
  ['#preguntas', 'Preguntas'],
] as const;
export function AppShell() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const landing = pathname === '/';
  // Open state is tied to the page it was opened on, so navigating closes the menu.
  const [menuPage, setMenuPage] = useState<string | null>(null);
  const menuOpen = menuPage === pathname;
  const setMenuOpen = (open: boolean) => setMenuPage(open ? pathname : null);
  return (
    <>
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <header className={landing ? 'site-header site-header-overlay' : 'site-header'}>
        <div className="header-inner">
          <Wordmark />
          <div
            id="menu-principal"
            className={landing ? `header-nav collapsible${menuOpen ? ' open' : ''}` : 'header-nav'}
          >
            {landing && (
              <nav className="section-nav" aria-label="Secciones">
                <ul>
                  {sections.map(([href, label]) => (
                    <li key={href}>
                      <a href={href} onClick={() => setMenuOpen(false)}>
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <nav className="header-actions" aria-label="Principal">
              {auth.token ? (
                <Link className="header-login" to="/mi-club">
                  Mi club
                </Link>
              ) : (
                <>
                  <Link className="header-login" to="/ingresar">
                    Ingresar
                  </Link>
                  <Link className="header-login header-outline" to="/registro">
                    Únete gratis
                  </Link>
                </>
              )}
            </nav>
          </div>
          {landing && (
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="menu-principal"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span aria-hidden="true" />
              <span className="sr-only">Menú</span>
            </button>
          )}
        </div>
      </header>
      <main id="contenido">
        <Outlet />
      </main>
      <footer className="site-footer">
        <Wordmark />
        <p>Tus compras suman. Tu constancia gana.</p>
        <div>
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/caja">Acceso caja</Link>
        </div>
        <small>© {new Date().getFullYear()} SmartClub 2.0 · Ecuador</small>
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
      <h1>
        Algo <strong>salió mal</strong>
      </h1>
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
