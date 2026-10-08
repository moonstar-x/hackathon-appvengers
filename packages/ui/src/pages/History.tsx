import { useState } from 'react';
import { LigaTabs } from '../components/LigaTabs';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { HistoryDto, Purchase } from '@club/shared';
import { request } from '../api/client';
import { useProgram } from '../api/queries';
import { Money, Button, Spinner, Alert, TierBadge } from '../components/ui';
export function Component() {
  const [selected, setSelected] = useState('');
  const history = useQuery({
    queryKey: ['me', 'history'],
    queryFn: () => request<HistoryDto>('/me/history?months=6'),
  });
  const program = useProgram();
  const purchases = useInfiniteQuery({
    queryKey: ['me', 'purchases'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      request<{
        items: Pick<Purchase, 'purchaseId' | 'amountCents' | 'purchasedAt' | 'businessId'>[];
        cursor?: string;
      }>('/me/purchases' + (pageParam ? '?cursor=' + encodeURIComponent(pageParam) : '')),
    getNextPageParam: (last) => last.cursor,
  });
  const liga = history.data?.ligas.find((s) => s.streakId === selected) ?? history.data?.ligas[0];
  const definition = program.data?.streaks.find((s) => s.streakId === liga?.streakId);
  const max = Math.max(
    definition?.tiers.at(-1)?.minMonthlyCents ?? 1,
    ...(liga?.months ?? []).map((h) => h.totalCents),
  );
  return (
    <div className="narrow page">
      <span className="eyebrow text-brand-strong">CADA MES CUENTA</span>
      <h1>
        Tu <strong>historial</strong>.
      </h1>
      <p className="muted">Mira cómo crece tu constancia.</p>
      {history.isPending ? (
        <Spinner />
      ) : history.error ? (
        <Alert>{history.error.message}</Alert>
      ) : (
        <>
          <LigaTabs
            ligas={history.data.ligas.map((s) => ({ streakId: s.streakId, name: s.streakName }))}
            selected={liga?.streakId ?? ''}
            onSelect={setSelected}
            prefix="history"
          />
          <section
            className="card history-chart"
            id="history-panel"
            role="tabpanel"
            aria-labelledby={`history-tab-${liga?.streakId ?? ''}`}
          >
            {[...(liga?.months ?? [])].reverse().map((h) => (
              <div className="history-month" key={h.monthKey}>
                <div className="row-between">
                  <span className="capitalize">{h.monthLabel}</span>
                  <Money cents={h.totalCents} />
                </div>
                <div className="history-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${(h.totalCents / max) * 100}%` }}
                  />
                  {definition?.tiers.map((t) => (
                    <span
                      className="threshold-line"
                      title={`${t.name} ${t.minMonthlyCents / 100}`}
                      key={t.tierId}
                      style={{ left: `${(t.minMonthlyCents / max) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="row-between">
                  <small className="muted">{h.purchaseCount} compras</small>
                  <TierBadge tierId={h.tier?.tierId} name={h.tier?.name} />
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      <h2>Tus compras</h2>
      {purchases.isPending ? (
        <Spinner />
      ) : purchases.error ? (
        <Alert>{purchases.error.message}</Alert>
      ) : (
        <section className="card">
          {purchases.data.pages
            .flatMap((p) => p.items)
            .map((p) => (
              <div className="purchase-row" key={p.purchaseId}>
                <div>
                  <strong>
                    {program.data?.businesses.find((b) => b.businessId === p.businessId)?.name ??
                      p.businessId}
                  </strong>
                  <small>
                    {new Date(p.purchasedAt).toLocaleString('es-EC', {
                      timeZone: 'America/Guayaquil',
                    })}
                  </small>
                </div>
                <Money cents={p.amountCents} />
              </div>
            ))}
          {purchases.data.pages[0]?.items.length === 0 && (
            <p className="muted">Todavía no tienes compras registradas.</p>
          )}
          {purchases.hasNextPage && (
            <Button
              variant="secondary"
              disabled={purchases.isFetchingNextPage}
              onClick={() => {
                void purchases.fetchNextPage();
              }}
            >
              Ver más compras
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
