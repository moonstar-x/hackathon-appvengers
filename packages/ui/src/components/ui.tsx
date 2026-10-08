import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, isDiscountBenefit } from '@club/shared';
import type {
  Receipt,
  TierId,
  ProgressSummary,
  CustomerRewardDto,
  BenefitDefinition,
  BusinessDefinition,
} from '@club/shared';
import { QRCodeSVG } from 'qrcode.react';
import { program } from '../theme';
export function Wordmark() {
  return (
    <Link className="wordmark" to="/" aria-label={program.displayName + ' inicio'}>
      <span className="wordmark-symbol" aria-hidden="true">
        s
      </span>
      <strong>smart</strong>
      <span>club</span>
      <span className="wordmark-version">2.0</span>
    </Link>
  );
}
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button {...props} className={`button ${variant} ${className}`} />;
}
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="alert">
      {children}
    </div>
  );
}
export function Spinner() {
  return (
    <p role="status" className="loading">
      Cargando tu club…
    </p>
  );
}
export function Money({ cents }: { cents: number }) {
  return <>{formatMoney(cents)}</>;
}
export function TierBadge({ tierId, name }: { tierId?: TierId; name?: string }) {
  return (
    <span className={`tier-badge ${tierId?.toLowerCase() ?? 'member'}`}>{name ?? 'Miembro'}</span>
  );
}
export function ProgressToNextTier({ summary: s }: { summary: ProgressSummary }) {
  const max = s.tiers.at(-1)?.minMonthlyCents ?? 1;
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Acumulado del mes"
        aria-valuenow={s.totalCents}
        aria-valuemin={0}
        aria-valuemax={Math.max(max, s.totalCents)}
        className="progress-track"
      >
        <div
          className="progress-fill"
          style={{ width: `${Math.min(100, (s.totalCents / max) * 100)}%` }}
        />
      </div>
      <div className="tier-markers">
        {s.tiers.map((t) => (
          <span key={t.tierId}>
            {t.name}
            <b>
              <Money cents={t.minMonthlyCents} />
            </b>
          </span>
        ))}
      </div>
      <p className="next-tier">
        {s.nextTier ? (
          <>
            Te faltan{' '}
            <strong>
              <Money cents={s.nextTier.gapCents} />
            </strong>{' '}
            para {s.nextTier.name.toUpperCase()}
          </>
        ) : (
          <>¡Llegaste a ORO este mes!</>
        )}
      </p>
    </div>
  );
}
export function StreakTracker({ tier }: { tier: ProgressSummary['tiers'][number] }) {
  return (
    <div className="streak-row">
      <div className="row-between">
        <TierBadge tierId={tier.tierId} name={tier.name} />
        <span className={`status ${tier.streak.status.toLowerCase()}`}>
          {{ ACTIVE: 'Activa', AT_RISK: 'En riesgo', NONE: 'Sin racha' }[tier.streak.status]}
        </span>
      </div>
      {tier.rewards.map((r) => (
        <div key={r.rewardId}>
          <div
            className="streak-dots"
            aria-label={`Mes ${r.progressInCycle} de ${r.requiredConsecutiveMonths}`}
          >
            {Array.from({ length: r.requiredConsecutiveMonths }, (_, i) => (
              <span key={i} className={i < r.progressInCycle ? 'filled' : ''}>
                {i < r.progressInCycle ? '✓' : i + 1}
              </span>
            ))}
            <small>
              {r.unlockedThisMonth
                ? '¡Recompensa desbloqueada!'
                : `Mes ${r.progressInCycle} de ${r.requiredConsecutiveMonths}`}
            </small>
          </div>
          <p className="muted small">
            {r.benefits.map((b) => b.title).join(r.selection === 'ONE_OF' ? ' o ' : ' + ')}
          </p>
        </div>
      ))}
    </div>
  );
}
export function RewardCard({
  reward: r,
  onChoose,
  businesses = program.businesses,
}: {
  reward: CustomerRewardDto;
  businesses?: BusinessDefinition[];
  onChoose?: (r: CustomerRewardDto) => void;
}) {
  return (
    <article className="card reward-card">
      <div className="row-between">
        <TierBadge tierId={r.tierId} name={r.tierName} />
        <span className="small muted">
          {
            {
              AVAILABLE: 'Disponible',
              PENDING_CHOICE: 'Por elegir',
              REDEEMED: 'Usada',
              EXPIRED: 'Vencida',
            }[r.status]
          }
        </span>
      </div>
      <p className="reward-liga">{r.streakName}</p>
      <h3>{r.benefit?.title ?? 'Elige tu recompensa'}</h3>
      <p className="muted">
        {r.benefit?.description ?? r.options?.map((o) => o.title).join(' · ')}
      </p>
      <p className="small">
        Canjeable en:{' '}
        {r.redeemableAt
          .map((id) => businesses.find((b) => b.businessId === id)?.name ?? id)
          .join(', ')}
      </p>
      {(r.benefit ? [r.benefit] : (r.options ?? [])).map((b) => (
        <DiscountCap key={b.benefitId} benefit={b} />
      ))}
      <div className="reward-code">
        <code>{r.code}</code>
        <QRCodeSVG value={r.code} size={88} title={'Código ' + r.code} />
      </div>
      <p className="small muted">
        Válida desde{' '}
        {new Date(r.validFrom).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' })} hasta{' '}
        {new Date(r.expiresAt).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' })}
      </p>
      {r.status === 'PENDING_CHOICE' && onChoose && (
        <Button onClick={() => onChoose(r)}>Elegir beneficio</Button>
      )}
    </article>
  );
}
export function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  return (
    <div className="receipt-paper print-area">
      <p className="receipt-heading">{program.displayName} · Comprobante de progreso</p>
      <pre aria-label="Factura de progreso">{receipt.lines.join('\n')}</pre>
    </div>
  );
}
export function DiscountCap({ benefit }: { benefit: BenefitDefinition }) {
  if (!isDiscountBenefit(benefit)) return null;
  const cap = benefit.type === 'FIXED_DISCOUNT' ? benefit.amountCents : benefit.maxDiscountCents;
  return cap === undefined ? null : <p className="small">Descuento máximo: {formatMoney(cap)}</p>;
}
