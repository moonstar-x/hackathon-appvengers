export const TABLE_SPECS = [
  { logicalName: 'Businesses', env: 'TABLE_BUSINESSES', pk: 'businessId', gsis: [] },
  { logicalName: 'Customers', env: 'TABLE_CUSTOMERS', pk: 'ci', gsis: [] },
  { logicalName: 'Streaks', env: 'TABLE_STREAKS', pk: 'streakId', gsis: [] },
  {
    logicalName: 'CustomerStreakProgress',
    env: 'TABLE_PROGRESS',
    pk: 'ci',
    sk: 'progressKey',
    gsis: [],
  },
  {
    logicalName: 'Purchases',
    env: 'TABLE_PURCHASES',
    pk: 'purchaseId',
    gsis: [{ name: 'byCustomer', pk: 'ci', sk: 'purchasedAt' }],
  },
  {
    logicalName: 'CustomerRewards',
    env: 'TABLE_REWARDS',
    pk: 'ci',
    sk: 'rewardInstanceId',
    gsis: [{ name: 'byCode', pk: 'code' }],
  },
] as const;
export type TableEnv = (typeof TABLE_SPECS)[number]['env'];
export type TableNames = Record<TableEnv, string>;
export function localTableNames(): TableNames {
  return Object.fromEntries(
    TABLE_SPECS.map((t) => [t.env, `smartclub-local-${t.logicalName}`]),
  ) as TableNames;
}
