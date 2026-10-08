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
  const s = data.progress[0];
  if (!s) return <div className="narrow page">Tu programa estará disponible pronto.</div>;
  const count =
    rewards.data?.filter((r) => r.status === 'AVAILABLE' || r.status === 'PENDING_CHOICE').length ??
    0;
  return (
    <div className="narrow page dashboard">
      <div className="row-between">
        <div>
          <span className="eyebrow text-brand-strong">MI CLUB</span>
          <h1 className="capitalize">{s.monthLabel}</h1>
        </div>
        <span className="small muted">{s.daysLeftInMonth} días para sumar</span>
      </div>
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
        <Link to="/recompensas">{count} recompensas →</Link>
      </div>
      <section className="card">
        {s.tiers.map((t) => (
          <StreakTracker key={t.tierId} tier={t} />
        ))}
      </section>
      <section className="card soft">
        <span className="eyebrow text-brand-strong">ASÍ SALE EN TU FACTURA</span>
        <p>{s.message}</p>
      </section>
      <section className="card">
        <h2>Tus marcas, una misma racha</h2>
        <p className="muted">
          Visitaste {s.businessesVisited.length} de {program.data?.businesses.length ?? 0} marcas
        </p>
        <div className="business-chips">
          {program.data?.businesses.map((b) => (
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
  );
}
