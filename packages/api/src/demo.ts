import { addMonths, monthKeyOf } from '@club/shared';
import type { Container } from './container';
export async function seedDemo(c: Container) {
  const month = monthKeyOf(c.clock.now());
  const eco = c.tenant.id === 'ecoclub';
  const users = eco
    ? [
        ['1700000001', 'demo.eco1@example.com'],
        ['1700000019', 'demo.eco2@example.com'],
        ['0900000001', 'demo.eco3@example.com'],
      ]
    : [
        ['1700000027', 'demo.farma1@example.com'],
        ['0900000019', 'demo.farma2@example.com'],
      ];
  for (const [ci, email] of users)
    if (ci && email) await c.customers.register({ ci, email, channel: 'POS' }, true);
  const plans = eco
    ? [
        {
          ci: '1700000001',
          business: 'farmacias-economicas',
          months: [-2, -1, 0],
          amounts: [1500, 1500, 1200],
        },
        { ci: '1700000019', business: 'farmacias-economicas', months: [0], amounts: [1800] },
      ]
    : [
        {
          ci: '1700000027',
          business: 'medicity',
          months: [-2, -1, 0],
          amounts: [6000, 6000, 5000],
        },
        {
          ci: '1700000027',
          business: 'mascotas',
          months: [-2, -1, 0],
          amounts: [6000, 6000, 5000],
        },
        { ci: '0900000019', business: 'wellderma', months: [0], amounts: [3000] },
      ];
  for (const plan of plans)
    for (const [i, offset] of plan.months.entries()) {
      const m = addMonths(month, offset);
      await c.purchases.record(
        {
          ci: plan.ci,
          amountCents: plan.amounts[i] ?? 0,
          transactionId: `demo-${plan.ci}-${plan.business}-${m}`,
          purchasedAt: offset === 0 ? c.clock.now().toISOString() : `${m}-15T12:00:00-05:00`,
          receiptWidth: 40,
        },
        plan.business,
        true,
      );
    }
}
