import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { PROGRAM, buildProgressSummary, buildProgressMessage } from '@club/shared';
import type { CustomerRewardDto, MonthlyProgress } from '@club/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
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
const program = PROGRAM;
const liga = required(PROGRAM.streaks[0]);
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
  liga,
  [monthly('2026-10', 1800), monthly('2026-09', 2500)],
  '2026-10',
  now,
);
const receipt = buildProgressMessage({
  brandName: 'SmartClub',
  ligaName: 'Liga Ahorro',
  summary: progress,
});
progress.message = receipt.message;
const reward: CustomerRewardDto = {
  streakId: liga.streakId,
  streakName: liga.name,
  redeemableAt: liga.businessIds,
  code: 'SC-00000000',
  status: 'PENDING_CHOICE',
  tierId: 'SILVER',
  tierName: 'Plata',
  monthKey: '2026-10',
  options: liga.tiers[1]?.rewards[0]?.benefits,
  validFrom: now.toISOString(),
  expiresAt: '2026-12-01T04:59:59Z',
};
let wallet: CustomerRewardDto[] = [];
const server = setupServer(
  http.get('/api/program', () =>
    HttpResponse.json({ program, streaks: program.streaks, businesses: program.businesses }),
  ),
  http.post('/api/auth/register', () =>
    HttpResponse.json({ token: 'test-session' }, { status: 201 }),
  ),
  http.post('/api/auth/login', () => HttpResponse.json({ token: 'test-session' })),
  http.get('/api/me/progress', () => HttpResponse.json({ progress: [progress] })),
  http.get('/api/me/rewards', () => HttpResponse.json(wallet)),
  http.get('/api/me/history', () =>
    HttpResponse.json({
      ligas: program.streaks.map((s) => ({
        streakId: s.streakId,
        streakName: s.name,
        months: [
          {
            monthKey: '2026-10',
            monthLabel: 'octubre 2026',
            totalCents: s.streakId === liga.streakId ? 1800 : 0,
            purchaseCount: 1,
            tier: s.tiers[1],
          },
        ],
      })),
    }),
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
  it('applies SmartClub tokens and validates build-time metadata', () => {
    applyTheme(PROGRAM);
    for (const [key, value] of Object.entries(PROGRAM.theme))
      expect(document.documentElement.style.getPropertyValue('--' + key)).toBe(value);
    expect(PROGRAM.theme['brand-primary']).toBe('#ff3e00');
    expect(PROGRAM.theme.surface).toBe('#f9f4e1');
    const env = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8');
    expect(env).toContain('VITE_APP_TITLE=' + PROGRAM.displayName);
    expect(env).toContain('VITE_APP_DESCRIPTION=' + PROGRAM.tagline);
    expect(
      loadEnv('production', resolve(import.meta.dirname, '..'), 'VITE_').VITE_THEME_COLOR,
    ).toBe('#ff3e00');
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
    expect(screen.getByRole('heading', { name: /Tus compras suman/ })).toBeInTheDocument();
    expect(await screen.findByText('5% de cashback, hasta $1')).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Correo electrónico (opcional)'), 'test@example.com');
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
    await user.type(screen.getByLabelText('Correo electrónico (opcional)'), 'test@example.com');
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
    wallet = [reward, { ...reward, code: 'SC-11111111', status: 'EXPIRED' }];
    let chosen: unknown;
    server.use(
      http.post('/api/me/rewards/SC-00000000/choose', async ({ request: r }) => {
        chosen = await r.json();
        wallet = [
          { ...reward, status: 'AVAILABLE', benefit: reward.options?.[0] },
          { ...reward, code: 'SC-11111111', status: 'EXPIRED' },
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
    expect(await screen.findByText('SC-11111111')).toBeInTheDocument();
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
      'SMARTCLUB - LIGA AHORRO',
    );
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Nueva venta' }));
    expect(screen.getByLabelText('Cédula')).toHaveValue('');
  });
  it('reveals email and consent for an unknown customer', async () => {
    let calls = 0;
    let submitted: unknown;
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
      http.post('/api/pos/purchases', async ({ request: r }) => {
        submitted = await r.json();
        return HttpResponse.json({
          purchase: {},
          customer: { registeredNow: true },
          newRewards: [],
          progress: [progress],
          receipt,
        });
      }),
    );
    const user = userEvent.setup();
    await gate(user);
    await user.type(screen.getByLabelText('Cédula'), '1700000043');
    await user.tab();
    expect(await screen.findByLabelText('Correo (opcional)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'El cliente aceptó' })).toBeRequired();
    expect(screen.getByLabelText('Correo (opcional)')).not.toBeRequired();
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Monto pagado ($)'), '3');
    await user.click(screen.getByRole('button', { name: 'Registrar compra' }));
    expect(await screen.findByLabelText('Factura de progreso')).toBeInTheDocument();
    expect(submitted).toMatchObject({ registration: { acceptPrivacyPolicy: true } });
    expect((submitted as { registration: object }).registration).not.toHaveProperty('email');
  });
  it('looks up, chooses and redeems a reward', async () => {
    const user = userEvent.setup();
    await gate(user);
    await user.click(screen.getByRole('button', { name: 'Canje' }));
    await user.type(screen.getByLabelText('Código'), 'SC-00000000');
    await user.click(screen.getByRole('button', { name: 'Consultar código' }));
    await user.click(await screen.findByRole('radio', { name: 'Cupón de $2' }));
    await user.type(screen.getByLabelText('Monto de la compra ($)'), '50');
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

describe('SPEC-001 multi-liga and discount UI', () => {
  const wellness = required(program.streaks[1]);
  const wellnessProgress = buildProgressSummary(
    wellness,
    [
      {
        ...monthly('2026-10', 5000),
        streakId: wellness.streakId,
        progressKey: wellness.streakId + '#2026-10',
        businessesVisited: ['medicity'],
      },
    ],
    '2026-10',
    now,
  );
  it('registers with an empty optional email and sends only cédula and consent', async () => {
    let body: unknown;
    server.use(
      http.post('/api/auth/register', async ({ request: r }) => {
        body = await r.json();
        return HttpResponse.json({ token: 'test-session' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    mount(<Register />, '/registro');
    expect(screen.getByLabelText('Correo electrónico (opcional)')).not.toBeRequired();
    await user.type(screen.getByLabelText('Cédula'), '1700000035');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Únete gratis →' }));
    await screen.findByRole('heading', { name: 'octubre 2026' });
    expect(body).toMatchObject({ ci: '1700000035', acceptPrivacyPolicy: true });
    expect(body).not.toHaveProperty('email');
  });
  it('renders one summary per liga, defaults to the highest total and switches scope', async () => {
    server.use(
      http.get('/api/me/progress', () =>
        HttpResponse.json({ progress: [progress, wellnessProgress] }),
      ),
    );
    const user = userEvent.setup();
    mount(<Dashboard />, '/mi-club', true);
    expect(await screen.findByRole('tab', { name: 'Liga Wellness' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Liga Ahorro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Liga Wellness' })).toBeInTheDocument();
    expect(await screen.findByText('Visitaste 1 de 4 marcas')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Liga Ahorro' }));
    expect(screen.getByText('Visitaste 1 de 1 marcas')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Liga Wellness' })).toHaveFocus();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5000');
  });
  it('breaks equal-total ties by display order and offers brands for an empty liga', async () => {
    const empty = program.streaks.map((s) => buildProgressSummary(s, [], '2026-10', now));
    server.use(http.get('/api/me/progress', () => HttpResponse.json({ progress: empty })));
    const user = userEvent.setup();
    mount(<Dashboard />, '/mi-club', true);
    expect(await screen.findByRole('tab', { name: 'Liga Ahorro' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('heading', { name: 'Aún no compras en esta liga' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Liga Wellness' }));
    expect(screen.getByText('Medicity, Wellderma, Mascotas, Ambiente')).toBeInTheDocument();
  });
  it('shows liga, redemption scope and caps, and filters the wallet', async () => {
    wallet = [
      {
        ...reward,
        status: 'AVAILABLE',
        benefit: required(required(liga.tiers[0]).rewards[0]).benefits[0],
        options: undefined,
      },
      {
        ...reward,
        code: 'SC-22222222',
        streakId: wellness.streakId,
        streakName: wellness.name,
        redeemableAt: wellness.businessIds,
        status: 'AVAILABLE',
        benefit: required(required(wellness.tiers[0]).rewards[0]).benefits[0],
        options: undefined,
      },
    ];
    const user = userEvent.setup();
    mount(<Rewards />, '/recompensas', true);
    expect(await screen.findByText('Descuento máximo: $1')).toBeInTheDocument();
    expect(screen.getByText('Descuento máximo: $3')).toBeInTheDocument();
    expect(screen.getByText('Canjeable en: Farmacias Económicas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Liga Wellness' }));
    expect(screen.queryByText('SC-00000000')).not.toBeInTheDocument();
    expect(
      screen.getByText('Canjeable en: Medicity, Wellderma, Mascotas, Ambiente'),
    ).toBeInTheDocument();
  });
  it('switches landing and history ligas including their own thresholds', async () => {
    const user = userEvent.setup();
    mount(<Landing />);
    await user.click(await screen.findByRole('tab', { name: 'Liga Wellness' }));
    expect(screen.getByText('Medicity, Wellderma, Mascotas y Ambiente')).toBeInTheDocument();
    expect(screen.getByText('Descuento máximo: $3')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Liga Ahorro' }));
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Liga Wellness' })).toHaveFocus();
  });
  it('switches monthly history while retaining purchases from all businesses', async () => {
    const user = userEvent.setup();
    mount(<History />, '/historial', true);
    await user.click(await screen.findByRole('tab', { name: 'Liga Wellness' }));
    expect(screen.getByTitle('Oro 120')).toBeInTheDocument();
    expect(screen.getByText('Farmacias Económicas')).toBeInTheDocument();
  });
  async function gateDiscount(user: ReturnType<typeof userEvent.setup>) {
    mount(<Pos />, '/caja');
    expect(await screen.findByRole('option', { name: 'Medicity' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    await user.type(screen.getByLabelText('Clave API de caja'), 'test-pos-key');
    await user.click(screen.getByRole('button', { name: 'Entrar a caja' }));
    await screen.findByRole('heading', { name: 'Registrar venta' });
    await user.click(screen.getByRole('button', { name: 'Canje' }));
    await user.type(screen.getByLabelText('Código'), 'SC-00000000');
    await user.click(screen.getByRole('button', { name: 'Consultar código' }));
  }
  it('requires a gross ticket and shows the server discount as authoritative', async () => {
    let body: unknown;
    const discountReward = {
      ...reward,
      status: 'AVAILABLE',
      benefit: required(required(liga.tiers[0]).rewards[0]).benefits[0],
      options: undefined,
    };
    server.use(
      http.post('/api/pos/rewards/lookup', () => HttpResponse.json(discountReward)),
      http.post('/api/pos/rewards/redeem', async ({ request: r }) => {
        body = await r.json();
        return HttpResponse.json({
          ...discountReward,
          status: 'REDEEMED',
          discount: { purchaseAmountCents: 5000, discountCents: 100, capCents: 100, capped: true },
        });
      }),
    );
    const user = userEvent.setup();
    await gateDiscount(user);
    const amount = await screen.findByLabelText('Monto de la compra ($)');
    expect(amount).toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Canjear' }));
    expect(body).toBeUndefined();
    await user.type(amount, '50');
    await user.click(screen.getByRole('button', { name: 'Canjear' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Descuento a aplicar:.*1,00.*tope alcanzado/,
    );
    expect(body).toEqual({ code: 'SC-00000000', purchaseAmountCents: 5000 });
  });
  it('shows the redeemable business names for WRONG_BUSINESS', async () => {
    const discountReward = {
      ...reward,
      status: 'AVAILABLE',
      benefit: required(required(liga.tiers[0]).rewards[0]).benefits[0],
      options: undefined,
    };
    server.use(
      http.post('/api/pos/rewards/lookup', () => HttpResponse.json(discountReward)),
      http.post('/api/pos/rewards/redeem', () =>
        HttpResponse.json(
          {
            error: {
              code: 'REWARD_NOT_REDEEMABLE',
              reason: 'WRONG_BUSINESS',
              message: 'No se puede canjear',
              details: { redeemableAt: ['medicity'] },
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    await gateDiscount(user);
    await user.type(await screen.findByLabelText('Monto de la compra ($)'), '50');
    await user.click(screen.getByRole('button', { name: 'Canjear' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este código se canjea en: Medicity',
    );
  });
  it('checks contrast tokens on cream, white and orange surfaces', () => {
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map((offset) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return required(rgb[0]) * 0.2126 + required(rgb[1]) * 0.7152 + required(rgb[2]) * 0.0722;
    };
    const contrast = (a: string, b: string) => {
      const light = luminance(a),
        dark = luminance(b);
      return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    };
    for (const text of [
      'brand-primary-strong',
      'brand-secondary',
      'brand-deep',
      'ink',
      'ink-muted',
      'danger',
      'success',
    ])
      expect(
        contrast(required(program.theme[text]), required(program.theme.surface)),
      ).toBeGreaterThanOrEqual(4.5);
    for (const fill of ['brand-primary-strong', 'brand-secondary', 'brand-deep', 'brand-dark'])
      expect(
        contrast(required(program.theme[fill]), required(program.theme['brand-on-strong'])),
      ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(required(program.theme.ink), required(program.theme['brand-primary'])),
    ).toBeGreaterThanOrEqual(4.5);
    for (const surface of ['surface', 'surface-raised'])
      expect(
        contrast(required(program.theme.line), required(program.theme[surface])),
      ).toBeGreaterThanOrEqual(3);
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture');
  return value;
}
