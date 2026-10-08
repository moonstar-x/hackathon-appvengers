import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { dollarsToCents, isValidCi, normalizeCi, codeSchema, purchaseSchema } from '@club/shared';
import type { PurchaseResult, CustomerRewardDto, Receipt } from '@club/shared';
import { request, ApiError } from '../api/client';
import { useProgram } from '../api/queries';
import { tenant } from '../theme';
import { CiField } from '../components/CiField';
import { Button, Alert, ReceiptPreview, RewardCard, Spinner } from '../components/ui';
const storageKey = tenant.id + '-pos';
function saved() {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === 'object' &&
      'key' in value &&
      typeof value.key === 'string' &&
      'businessId' in value &&
      typeof value.businessId === 'string'
    )
      return { key: value.key, businessId: value.businessId };
  } catch {
    /* Private browsing can disable storage. */
  }
  return null;
}
function localDateTime() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function Component() {
  const program = useProgram();
  const query = useQueryClient();
  const [credentials, setCredentials] = useState(saved);
  const [key, setKey] = useState('');
  const [businessId, setBusiness] = useState(tenant.businesses[0]?.businessId ?? '');
  const [tab, setTab] = useState('venta');
  const [ci, setCi] = useState('');
  const [email, setEmail] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDateTime);
  const [tx, setTx] = useState<string>(() => crypto.randomUUID());
  const [width, setWidth] = useState<32 | 40 | 48>(40);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [code, setCode] = useState('');
  const [reward, setReward] = useState<CustomerRewardDto | null>(null);
  const [benefit, setBenefit] = useState('');
  const [posterBusiness, setPosterBusiness] = useState(businessId);
  const [channel, setChannel] = useState('qr');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function fail(e: unknown) {
    if (e instanceof ApiError && e.code === 'INVALID_POS_KEY') {
      setCredentials(null);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Storage disabled. */
      }
    }
    setError(e instanceof Error ? e.message : 'No pudimos completar la solicitud');
  }
  async function run(task: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await task();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function lookupCustomer() {
    setUnknown(false);
    setAccepted(false);
    setEmail('');
    if (!credentials || !isValidCi(normalizeCi(ci))) return;
    try {
      const r = await request<{ receipt: Receipt }>('/pos/customers/progress', {
        body: { ci: normalizeCi(ci), receiptWidth: width },
        pos: credentials,
      });
      setReceipt(r.receipt);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CUSTOMER_NOT_FOUND') {
        setUnknown(true);
        setReceipt(null);
      } else fail(e);
    }
  }
  if (program.isPending) return <Spinner />;
  if (!credentials)
    return (
      <div className="narrow page">
        <span className="eyebrow text-brand-strong">POS SIMULATOR</span>
        <h1>Acceso caja.</h1>
        <p className="muted">Registra compras y canjea beneficios.</p>
        <form
          className="card form-card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const pos = { key, businessId };
              try {
                await request('/pos/customers/progress', { body: { ci: '0900000001' }, pos });
              } catch (e) {
                if (!(e instanceof ApiError && e.code === 'CUSTOMER_NOT_FOUND')) throw e;
              }
              setCredentials(pos);
              try {
                sessionStorage.setItem(storageKey, JSON.stringify(pos));
              } catch {
                /* Current tab works without storage. */
              }
            });
          }}
        >
          <div className="field">
            <label htmlFor="pos-key">Clave API de caja</label>
            <input
              id="pos-key"
              type="password"
              autoComplete="off"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="business">Negocio</label>
            <select id="business" value={businessId} onChange={(e) => setBusiness(e.target.value)}>
              {program.data?.businesses.map((b) => (
                <option key={b.businessId} value={b.businessId}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {error && <Alert>{error}</Alert>}
          <Button disabled={busy}>Entrar a caja</Button>
        </form>
      </div>
    );
  const posterUrl =
    location.origin +
    '/registro?canal=' +
    channel +
    '&negocio=' +
    encodeURIComponent(posterBusiness);
  return (
    <div className="wide page">
      <div className="row-between">
        <div>
          <span className="eyebrow text-brand-strong">
            POS SIMULATOR ·{' '}
            {program.data?.businesses.find((b) => b.businessId === credentials.businessId)?.name}
          </span>
          <h1>Una compra. Más posibilidades.</h1>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setCredentials(null);
            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              /* Storage disabled. */
            }
          }}
        >
          Cambiar caja
        </Button>
      </div>
      <div className="tabs">
        {['venta', 'canje', 'material'].map((t) => (
          <button
            key={t}
            className={tab === t ? 'selected' : ''}
            onClick={() => {
              setTab(t);
              setError('');
            }}
          >
            {t === 'venta' ? 'Venta' : t === 'canje' ? 'Canje' : 'Material QR'}
          </button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <div aria-live="polite">
        {tab === 'venta' && (
          <div className="pos-grid">
            <form
              className="card form-card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (unknown && !accepted)
                    throw new Error('Confirma el consentimiento del cliente');
                  const parsed = purchaseSchema.safeParse({
                    ci,
                    transactionId: tx,
                    amountCents: dollarsToCents(amount),
                    purchasedAt: new Date(date).toISOString(),
                    receiptWidth: width,
                    ...(unknown ? { email } : {}),
                  });
                  if (!parsed.success)
                    throw new Error('Revisa la cédula, el correo, el monto y la fecha.');
                  const r = await request<PurchaseResult>('/pos/purchases', {
                    body: parsed.data,
                    pos: credentials,
                  });
                  setResult(r);
                  void query.invalidateQueries({ queryKey: ['me'] });
                  setReceipt(r.receipt);
                });
              }}
            >
              <h2>Registrar venta</h2>
              <div className="field">
                <label htmlFor="transaction">N° transacción</label>
                <input
                  id="transaction"
                  required
                  value={tx}
                  onChange={(e) => setTx(e.target.value)}
                />
              </div>
              <CiField
                value={ci}
                onChange={(v) => {
                  setCi(v);
                  setUnknown(false);
                  setReceipt(null);
                  setResult(null);
                }}
                onBlur={() => {
                  void run(lookupCustomer);
                }}
              />
              {unknown && (
                <div className="consent-box">
                  <p>Este cliente aún no pertenece al club.</p>
                  <div className="field">
                    <label htmlFor="pos-email">Correo electrónico</label>
                    <input
                      id="pos-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <p className="small">
                    ¿Autoriza el uso de su cédula y correo para el programa {tenant.displayName},
                    según nuestra política de privacidad?
                  </p>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      required
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    El cliente aceptó
                  </label>
                </div>
              )}
              <div className="field">
                <label htmlFor="amount">Monto pagado ($)</label>
                <input
                  id="amount"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="18,50"
                />
              </div>
              <div className="field">
                <label htmlFor="date">Fecha y hora</label>
                <input
                  id="date"
                  type="datetime-local"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="width">Ancho de factura</label>
                <select
                  id="width"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value) as 32 | 40 | 48)}
                >
                  {[32, 40, 48].map((w) => (
                    <option key={w} value={w}>
                      {w} columnas
                    </option>
                  ))}
                </select>
              </div>
              <Button disabled={busy || !isValidCi(normalizeCi(ci))}>Registrar compra</Button>
            </form>
            <div>
              {receipt ? (
                <>
                  <ReceiptPreview receipt={receipt} />
                  <div className="receipt-actions">
                    <Button onClick={() => window.print()}>Imprimir</Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setCi('');
                        setAmount('');
                        setEmail('');
                        setUnknown(false);
                        setAccepted(false);
                        setResult(null);
                        setReceipt(null);
                        setTx(crypto.randomUUID());
                        setDate(localDateTime());
                      }}
                    >
                      Nueva venta
                    </Button>
                  </div>
                  {result?.newRewards.map((r) => (
                    <RewardCard key={r.code} reward={r} />
                  ))}
                </>
              ) : (
                <div className="empty-state">
                  <span aria-hidden="true">▤</span>
                  <h2>La próxima factura empieza aquí.</h2>
                  <p>Consulta una cédula o registra una compra para ver su progreso.</p>
                </div>
              )}
            </div>
          </div>
        )}
        {tab === 'canje' && (
          <div className="narrow">
            <form
              className="card form-card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const parsed = codeSchema.safeParse({ code });
                  if (!parsed.success) throw new Error('Revisa el código de la recompensa.');
                  const body = parsed.data;
                  const r = await request<CustomerRewardDto>('/pos/rewards/lookup', {
                    body,
                    pos: credentials,
                  });
                  setReward(r);
                  setBenefit('');
                });
              }}
            >
              <h2>Consultar recompensa</h2>
              <div className="field">
                <label htmlFor="reward-code">Código</label>
                <input
                  id="reward-code"
                  value={code}
                  required
                  onChange={(e) => {
                    setCode(e.target.value);
                    setReward(null);
                  }}
                  placeholder={tenant.rewardCodePrefix + '-XXXXXXXX'}
                />
              </div>
              <Button disabled={busy}>Consultar código</Button>
            </form>
            {reward && (
              <>
                <RewardCard reward={reward} />
                {reward.benefit?.businessIds && (
                  <p>Canje válido en: {reward.benefit.businessIds.join(', ')}</p>
                )}
                {reward.status === 'PENDING_CHOICE' && (
                  <div className="card">
                    <h3>El cliente elige</h3>
                    {reward.options?.map((o) => (
                      <label className="choice-option" key={o.benefitId}>
                        <input
                          type="radio"
                          name="pos-benefit"
                          value={o.benefitId}
                          checked={benefit === o.benefitId}
                          onChange={() => setBenefit(o.benefitId)}
                        />
                        <span>
                          {o.title}
                          {o.businessIds && <small>En {o.businessIds.join(', ')}</small>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <Button
                  disabled={
                    busy ||
                    !['AVAILABLE', 'PENDING_CHOICE'].includes(reward.status) ||
                    (reward.status === 'PENDING_CHOICE' && !benefit)
                  }
                  onClick={() => {
                    void run(async () => {
                      const r = await request<CustomerRewardDto>('/pos/rewards/redeem', {
                        body: { code: reward.code, ...(benefit ? { benefitId: benefit } : {}) },
                        pos: credentials,
                      });
                      setReward(r);
                      void query.invalidateQueries({ queryKey: ['me'] });
                    });
                  }}
                >
                  Canjear
                </Button>
              </>
            )}
          </div>
        )}
        {tab === 'material' && (
          <div className="pos-grid">
            <div className="card form-card">
              <h2>Material para tu negocio</h2>
              <div className="field">
                <label htmlFor="poster-business">Negocio del cartel</label>
                <select
                  id="poster-business"
                  value={posterBusiness}
                  onChange={(e) => setPosterBusiness(e.target.value)}
                >
                  {program.data?.businesses.map((b) => (
                    <option key={b.businessId} value={b.businessId}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="channel">Canal</label>
                <select id="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="qr">QR en el negocio</option>
                  <option value="social">Redes sociales</option>
                </select>
              </div>
              <Button onClick={() => window.print()}>Imprimir cartel A5</Button>
            </div>
            <div className="poster print-area">
              <span className="eyebrow">{tenant.displayName}</span>
              <h2>
                Escanea, regístrate
                <br />
                con tu cédula y gana.
              </h2>
              <QRCodeSVG value={posterUrl} size={220} title="Registro al club" />
              <p>Tu próxima recompensa empieza aquí.</p>
              <small>
                {program.data?.businesses.find((b) => b.businessId === posterBusiness)?.name}
              </small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
