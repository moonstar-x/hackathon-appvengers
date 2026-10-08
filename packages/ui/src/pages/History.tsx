import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { TierDefinition, Purchase } from '@club/shared';
import { request } from '../api/client';
import { useProgram } from '../api/queries';
import { Money, Button, Spinner, Alert, TierBadge } from '../components/ui';
type HistoryItem = {
  monthKey: string;
  monthLabel: string;
  totalCents: number;
  purchaseCount: number;
  tier: TierDefinition | null;
};
export function Component() {
  const history = useQuery({
    queryKey: ['me', 'history'],
    queryFn: () => request<HistoryItem[]>('/me/history?months=6'),
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
  const max = Math.max(
    program.data?.streaks[0]?.tiers.at(-1)?.minMonthlyCents ?? 1,
    ...(history.data ?? []).map((h) => h.totalCents),
  );
  return (
    <div className="narrow page">
      <span className="eyebrow text-brand-strong">CADA MES CUENTA</span>
      <h1>Tu historial.</h1>
      <p className="muted">Mira cómo crece tu constancia.</p>
      {history.isPending ? (
        <Spinner />
      ) : history.error ? (
        <Alert>{history.error.message}</Alert>
      ) : (
        <section className="card history-chart">
          {[...history.data].reverse().map((h) => (
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
                {program.data?.streaks[0]?.tiers.map((t) => (
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
