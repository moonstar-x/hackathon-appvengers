import { addMonths, monthKeyOf } from '@club/shared';
import type { Container } from './container';
export async function seedDemo(c: Container) {
  const month = monthKeyOf(c.clock.now());
  const users = [
    { ci: '1700000001', email: 'demo.socio1@example.com' },
    { ci: '1700000019' },
    { ci: '0900000001' },
    { ci: '1700000027', email: 'demo.socio2@example.com' },
    { ci: '0900000019' },
  ];
  for (const user of users) await c.customers.register({ ...user, channel: 'POS' }, true);
  const plans = [
    {
      ci: '1700000001',
      business: 'farmacias-economicas',
      months: [-2, -1, 0],
      amounts: [1500, 1500, 1200],
    },
    { ci: '1700000019', business: 'farmacias-economicas', months: [0], amounts: [1800] },
    { ci: '1700000027', business: 'medicity', months: [-2, -1, 0], amounts: [6000, 6000, 5000] },
    { ci: '1700000027', business: 'mascotas', months: [-2, -1, 0], amounts: [6000, 6000, 5000] },
    { ci: '1700000027', business: 'farmacias-economicas', months: [0], amounts: [800] },
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
