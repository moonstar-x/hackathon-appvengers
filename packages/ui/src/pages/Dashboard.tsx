import { useState } from 'react';
import { LigaTabs } from '../components/LigaTabs';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ProgressSummary, CustomerRewardDto } from '@club/shared';
import { request } from '../api/client';
import { useProgram } from '../api/queries';
import {
  Money,
  TierBadge,
  ProgressToNextTier,
  StreakTracker,
  Spinner,
  Alert,
} from '../components/ui';
export function Component() {
  const [selected, setSelected] = useState('');
  const { data, isPending, error } = useQuery({
    queryKey: ['me', 'progress'],
    queryFn: () => request<{ progress: ProgressSummary[] }>('/me/progress'),
  });
  const rewards = useQuery({
    queryKey: ['me', 'rewards'],
    queryFn: () => request<CustomerRewardDto[]>('/me/rewards'),
  });
  const program = useProgram();
  if (isPending) return <Spinner />;
  if (error)
    return (
      <div className="narrow page">
        <Alert>{error.message}</Alert>
      </div>
    );
  const defaultLiga = data.progress.reduce<ProgressSummary | undefined>(
    (best, next) => (!best || next.totalCents > best.totalCents ? next : best),
    undefined,
  );
  const s = data.progress.find((liga) => liga.streakId === selected) ?? defaultLiga;
  if (!s) return <div className="narrow page">Tu programa estará disponible pronto.</div>;
  const hasPurchases =
    s.hasPurchasesInLookback ??
    (s.purchaseCount > 0 || s.tiers.some((tier) => tier.streak.status !== 'NONE'));
  const count =
    rewards.data?.filter((r) => r.status === 'AVAILABLE' || r.status === 'PENDING_CHOICE').length ??
    0;
  return (
    <div className="wide page dashboard">
      <div className="row-between">
        <div>
          <span className="eyebrow text-brand-strong">MI CLUB</span>
          <h1 className="capitalize">
            <strong>{s.monthLabel}</strong>
          </h1>
        </div>
        <span className="small muted">{s.daysLeftInMonth} días para sumar</span>
      </div>
      <div className="liga-summary-strip">
        {data.progress.map((liga) => (
          <article className="card liga-summary" key={liga.streakId}>
            <h2>{liga.streakName}</h2>
            <strong>
              <Money cents={liga.totalCents} />
            </strong>
            <TierBadge tierId={liga.currentTier?.tierId} name={liga.currentTier?.name} />
            <p className="small">
              {liga.nextTier ? (
                <>
                  Faltan <Money cents={liga.nextTier.gapCents} /> para {liga.nextTier.name}
                </>
              ) : (
                '¡Llegaste a Oro!'
              )}
            </p>
          </article>
        ))}
      </div>
      <LigaTabs
        ligas={data.progress.map((liga) => ({ streakId: liga.streakId, name: liga.streakName }))}
        selected={s.streakId}
        onSelect={setSelected}
        prefix="dashboard"
      />
      <div id="dashboard-panel" role="tabpanel" aria-labelledby={`dashboard-tab-${s.streakId}`}>
        {!hasPurchases && (
          <div className="empty-state">
            <h2>Aún no compras en esta liga</h2>
            <p>
              {s.businessIds
                .map((id) => program.data?.businesses.find((b) => b.businessId === id)?.name ?? id)
                .join(', ')}
            </p>
          </div>
        )}
        <section className="card total-card">
          <div className="row-between">
            <span className="muted">Tus compras del mes</span>
            <TierBadge tierId={s.currentTier?.tierId} name={s.currentTier?.name} />
          </div>
          <div className="big-money">
            <Money cents={s.totalCents} />
          </div>
          <p className="small muted">{s.purchaseCount} compras que cuentan</p>
          <ProgressToNextTier summary={s} />
        </section>
        <div className="row-between">
          <h2>Tus rachas</h2>
          <Link to="/recompensas">{count} recompensas ›</Link>
        </div>
        <section className="card">
          {s.tiers.map((t) => (
            <StreakTracker key={t.tierId} tier={t} />
          ))}
        </section>
        <section className="card dark-band">
          <span className="eyebrow">ASÍ SALE EN TU FACTURA</span>
          <p>{s.message}</p>
        </section>
        <section className="card">
          <h2>Tus marcas, una misma racha</h2>
          <p className="muted">
            Visitaste {s.businessesVisited.length} de {s.businessIds.length} marcas
          </p>
          <div className="business-chips">
            {program.data?.businesses
              .filter((b) => s.businessIds.includes(b.businessId))
              .map((b) => (
                <span
                  key={b.businessId}
                  className={s.businessesVisited.includes(b.businessId) ? 'visited' : ''}
                >
                  {s.businessesVisited.includes(b.businessId) ? '✓ ' : ''}
                  {b.name}
                </span>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
