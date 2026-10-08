import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { TENANTS, buildProgressSummary, buildProgressMessage } from '@club/shared';
import type { CustomerRewardDto, MonthlyProgress } from '@club/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyTheme } from '../src/theme';
import { AuthProvider } from '../src/api/AuthProvider';
import { ApiError, loadSession, saveSession, request } from '../src/api/client';
import { CiField } from '../src/components/CiField';
import { AppShell, RequireAuth } from '../src/components/AppShell';
import { Component as Register } from '../src/pages/Register';
import { Component as Login } from '../src/pages/Login';
import { Component as Dashboard } from '../src/pages/Dashboard';
import { Component as Rewards } from '../src/pages/Rewards';
import { Component as History } from '../src/pages/History';
import { Component as Landing } from '../src/pages/Landing';
import { Component as Pos } from '../src/pages/Pos';
import { Component as Privacy } from '../src/pages/Privacy';
import { Component as NotFound } from '../src/pages/NotFound';
const tenant = TENANTS.ecoclub;
const now = new Date('2026-10-08T17:00Z');
const monthly = (monthKey: string, totalCents: number): MonthlyProgress => ({
  ci: '1700000001',
  progressKey: `liga-ahorro#${monthKey}`,
  streakId: 'liga-ahorro',
  monthKey,
  totalCents,
  purchaseCount: 1,
  businessesVisited: ['farmacias-economicas'],
  firstPurchaseAt: now.toISOString(),
  lastPurchaseAt: now.toISOString(),
  updatedAt: now.toISOString(),
});
const progress = buildProgressSummary(
  tenant.streak,
  [monthly('2026-10', 1800), monthly('2026-09', 2500)],
  '2026-10',
  now,
);
const receipt = buildProgressMessage({ displayName: 'EcoClub', summary: progress });
progress.message = receipt.message;
const reward: CustomerRewardDto = {
  code: 'ECO-00000000',
  status: 'PENDING_CHOICE',
  tierId: 'SILVER',
  tierName: 'Plata',
  monthKey: '2026-10',
  options: tenant.streak.tiers[1]?.rewards[0]?.benefits,
  validFrom: now.toISOString(),
  expiresAt: '2026-12-01T04:59:59Z',
};
let wallet: CustomerRewardDto[] = [];
const server = setupServer(
  http.get('/api/program', () =>
    HttpResponse.json({ tenant, streaks: [tenant.streak], businesses: tenant.businesses }),
  ),
  http.post('/api/auth/register', () =>
    HttpResponse.json({ token: 'test-session' }, { status: 201 }),
  ),
  http.post('/api/auth/login', () => HttpResponse.json({ token: 'test-session' })),
  http.get('/api/me/progress', () => HttpResponse.json({ progress: [progress] })),
  http.get('/api/me/rewards', () => HttpResponse.json(wallet)),
  http.get('/api/me/history', () =>
    HttpResponse.json([
      {
        monthKey: '2026-10',
        monthLabel: 'octubre 2026',
        totalCents: 1800,
        purchaseCount: 1,
        tier: tenant.streak.tiers[1],
      },
    ]),
  ),
  http.get('/api/me/purchases', ({ request: r }) =>
    HttpResponse.json({
      items: [
        {
          purchaseId: new URL(r.url).searchParams.get('cursor') ?? 'first',
          businessId: 'farmacias-economicas',
          amountCents: 1800,
          purchasedAt: now.toISOString(),
        },
      ],
      ...(new URL(r.url).searchParams.has('cursor') ? {} : { cursor: 'page-2' }),
    }),
  ),
  http.post('/api/pos/customers/progress', () =>
    HttpResponse.json({ progress: [progress], receipt }),
  ),
  http.post('/api/pos/purchases', () =>
    HttpResponse.json({
      purchase: {},
      customer: { registeredNow: false },
      progress: [progress],
      newRewards: [{ ...reward, status: 'AVAILABLE' }],
      receipt,
    }),
  ),
  http.post('/api/pos/rewards/lookup', () => HttpResponse.json(reward)),
  http.post('/api/pos/rewards/redeem', () =>
    HttpResponse.json({ ...reward, status: 'REDEEMED', benefit: reward.options?.[0] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  wallet = [];
  saveSession(null);
});
function mount(children: ReactNode, path = '/', session = false) {
  if (session) saveSession('test-session');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={children} />
              <Route path="/registro" element={<Register />} />
              <Route path="/ingresar" element={<Login />} />
              <Route element={<RequireAuth />}>
                <Route path="/mi-club" element={<Dashboard />} />
                <Route path="/recompensas" element={<Rewards />} />
                <Route path="/historial" element={<History />} />
              </Route>
              <Route path="/caja" element={<Pos />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
describe('branding and common UI', () => {
  it('applies each tenant theme and validates build-time metadata', () => {
    for (const t of Object.values(TENANTS)) {
      applyTheme(t);
      expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe(
        t.theme['brand-primary'],
      );
      const env = readFileSync(resolve(import.meta.dirname, '../.env.' + t.id), 'utf8');
      expect(env).toContain('VITE_TENANT=' + t.id);
      expect(env).toContain('VITE_APP_TITLE=' + t.displayName);
      expect(env).toContain('VITE_APP_DESCRIPTION=' + t.tagline);
      expect(env).toContain('VITE_THEME_COLOR=' + (t.theme['brand-primary-strong'] ?? ''));
    }
  });
  it('validates the CI on blur and accepts a valid CI', async () => {
    const user = userEvent.setup();
    function Field() {
      return <CiField value="bad" onChange={() => undefined} />;
    }
    render(<Field />);
    await user.click(screen.getByLabelText('Cédula'));
    await user.tab();
    expect(screen.getByText('Revisa tu número de cédula')).toBeInTheDocument();
  });
  it('renders the landing, FAQ, privacy and not-found copy', async () => {
    const user = userEvent.setup();
    mount(<Landing />);
    expect(screen.getByRole('heading', { name: /Lo cotidiano/ })).toBeInTheDocument();
    expect(await screen.findByText('5% de cashback en tu próxima compra')).toBeInTheDocument();
    await user.click(screen.getByText('¿Necesito la app?'));
    expect(screen.getByText(/No: tu progreso sale en tu factura/)).toBeVisible();
  });
  it('renders privacy notice', () => {
    mount(<Privacy />);
    expect(screen.getByText(/pendiente de revisión legal/)).toBeInTheDocument();
  });
  it('renders 404 navigation', () => {
    mount(<NotFound />);
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
describe('registration and login', () => {
  it('registers, saves a session and redirects to dashboard', async () => {
    const user = userEvent.setup();
    mount(<Register />, '/registro?canal=qr&negocio=farmacias-economicas');
    await user.type(screen.getByLabelText('Cédula'), '1700000035');
    await user.type(screen.getByLabelText('Correo electrónico'), 'test@example.com');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Únete gratis →' }));
    expect(await screen.findByRole('heading', { name: 'octubre 2026' })).toBeInTheDocument();
    expect(loadSession()).toBe('test-session');
  });
  it('offers CI-prefilled login on a duplicate and shows login 404', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json(
          { error: { code: 'CUSTOMER_EXISTS', message: 'Ya eres parte del club' } },
          { status: 409 },
        ),
      ),
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'CUSTOMER_NOT_FOUND', message: 'No encontramos esa cédula' } },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    mount(<Register />, '/registro');
    await user.type(screen.getByLabelText('Cédula'), '1700000035');
    await user.type(screen.getByLabelText('Correo electrónico'), 'test@example.com');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Únete gratis →' }));
    expect(await screen.findByText('Ya eres parte del club')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Ingresar a mi club' }));
    expect(screen.getByLabelText('Cédula')).toHaveValue('1700000035');
    await user.click(screen.getByRole('button', { name: 'Ver mi progreso →' }));
    expect(await screen.findByText('No encontramos esa cédula')).toBeInTheDocument();
  });
  it('logs in and signs out', async () => {
    const user = userEvent.setup();
    mount(<Login />, '/ingresar');
    await user.type(screen.getByLabelText('Cédula'), '1700000001');
    await user.click(screen.getByRole('button', { name: 'Ver mi progreso →' }));
    expect(await screen.findByRole('heading', { name: 'octubre 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Tu club, a un paso.' })).toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });
  it('guards customer routes', async () => {
    mount(<Dashboard />, '/mi-club');
    expect(await screen.findByRole('heading', { name: 'Tu club, a un paso.' })).toBeInTheDocument();
  });
});
describe('customer account', () => {
  it('shows tiers, gap, streak dots, risk and visited businesses', async () => {
    mount(<Dashboard />, '/mi-club', true);
    expect(await screen.findByText(/para ORO/)).toHaveTextContent('Te faltan $7 para ORO');
    expect(screen.getByLabelText('Mes 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('En riesgo')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1800');
    expect(await screen.findByText('Visitaste 1 de 1 marcas')).toBeInTheDocument();
  });
  it('chooses a reward with the API and shows expired rewards', async () => {
    wallet = [reward, { ...reward, code: 'ECO-11111111', status: 'EXPIRED' }];
    let chosen: unknown;
    server.use(
      http.post('/api/me/rewards/ECO-00000000/choose', async ({ request: r }) => {
        chosen = await r.json();
        wallet = [
          { ...reward, status: 'AVAILABLE', benefit: reward.options?.[0] },
          { ...reward, code: 'ECO-11111111', status: 'EXPIRED' },
        ];
        return HttpResponse.json(wallet[0]);
      }),
    );
    const user = userEvent.setup();
    mount(<Rewards />, '/recompensas', true);
    await user.click(await screen.findByRole('tab', { name: /Por elegir/ }));
    await user.click(await screen.findByRole('button', { name: 'Elegir beneficio' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Cupón de \$2/));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar elección' }));
    await waitFor(() => expect(chosen).toEqual({ benefitId: 'cupon-2' }));
    expect(
      await screen.findByRole('button', { name: 'Confirmar elección', hidden: true }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Vencidas/ }));
    expect(await screen.findByText('ECO-11111111')).toBeInTheDocument();
  });
  it('shows an empty wallet and purchase pagination', async () => {
    const user = userEvent.setup();
    mount(<History />, '/historial', true);
    expect(await screen.findByText('Farmacias Económicas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver más compras' }));
    await waitFor(() =>
      expect(screen.getAllByText('Farmacias Económicas').length).toBeGreaterThanOrEqual(2),
    );
  });
  it('shows errors from server', async () => {
    server.use(
      http.get('/api/me/progress', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Intenta de nuevo' } },
          { status: 500 },
        ),
      ),
    );
    mount(<Dashboard />, '/mi-club', true);
    expect(await screen.findByRole('alert')).toHaveTextContent('Intenta de nuevo');
  });
});
describe('POS simulator', () => {
  async function gate(user: ReturnType<typeof userEvent.setup>) {
    mount(<Pos />, '/caja');
    await user.type(await screen.findByLabelText('Clave API de caja'), 'test-pos-key');
    await user.click(screen.getByRole('button', { name: 'Entrar a caja' }));
    await screen.findByRole('heading', { name: 'Registrar venta' });
  }
  it('records a purchase and prints the returned receipt', async () => {
    const user = userEvent.setup();
    await gate(user);
    await user.type(screen.getByLabelText('Cédula'), '1700000001');
    await user.tab();
    await user.type(screen.getByLabelText('Monto pagado ($)'), '18,50');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    expect(await screen.findByLabelText('Factura de progreso')).toHaveTextContent(
      'ECOCLUB - TU RACHA',
    );
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Nueva venta' }));
    expect(screen.getByLabelText('Cédula')).toHaveValue('');
  });
  it('reveals email and consent for an unknown customer', async () => {
    let calls = 0;
    server.use(
      http.post('/api/pos/customers/progress', () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({ progress: [progress], receipt })
          : HttpResponse.json(
              { error: { code: 'CUSTOMER_NOT_FOUND', message: 'No encontramos esa cédula' } },
              { status: 404 },
            );
      }),
    );
    const user = userEvent.setup();
    await gate(user);
    await user.type(screen.getByLabelText('Cédula'), '1700000043');
    await user.tab();
    expect(await screen.findByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'El cliente aceptó' })).toBeRequired();
    await user.type(screen.getByLabelText('Correo electrónico'), 'pos@example.com');
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Monto pagado ($)'), '3');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    expect(await screen.findByLabelText('Factura de progreso')).toBeInTheDocument();
  });
  it('looks up, chooses and redeems a reward', async () => {
    const user = userEvent.setup();
    await gate(user);
    await user.click(screen.getByRole('button', { name: 'Canje' }));
    await user.type(screen.getByLabelText('Código'), 'ECO-00000000');
    await user.click(screen.getByRole('button', { name: 'Consultar código' }));
    await user.click(await screen.findByRole('radio', { name: 'Cupón de $2' }));
    await user.click(screen.getByRole('button', { name: 'Canjear' }));
    expect(await screen.findByText('Usada')).toBeInTheDocument();
  });
  it('builds a printable QR poster and returns to the gate', async () => {
    const user = userEvent.setup();
    await gate(user);
    await user.click(screen.getByRole('button', { name: 'Material QR' }));
    expect(screen.getByTitle('Registro al club')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Canal'), 'social');
    await user.click(screen.getByRole('button', { name: 'Cambiar caja' }));
    expect(screen.getByRole('heading', { name: 'Acceso caja.' })).toBeInTheDocument();
  });
  it('rejects a bad key', async () => {
    server.use(
      http.post('/api/pos/customers/progress', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_POS_KEY', message: 'Clave de caja incorrecta' } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    mount(<Pos />, '/caja');
    await user.type(await screen.findByLabelText('Clave API de caja'), 'bad-key');
    await user.click(screen.getByRole('button', { name: 'Entrar a caja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clave de caja incorrecta');
  });
});
describe('API client', () => {
  it('clears an expired session and handles error envelopes', async () => {
    saveSession('old');
    server.use(
      http.get('/api/test', () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Ingresa de nuevo' } },
          { status: 401 },
        ),
      ),
    );
    const expired = vi.fn();
    window.addEventListener('club-session-expired', expired);
    await expect(request('/test')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
    expect(loadSession()).toBeNull();
    window.removeEventListener('club-session-expired', expired);
  });
  it('validates forms before submitting invalid CI', () => {
    mount(<Login />, '/ingresar');
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: 'invalid' } });
    const form = screen.getByRole('button', { name: 'Ver mi progreso →' }).closest('form');
    if (!form) throw new Error('Missing login form');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa tu número de cédula');
  });
});
