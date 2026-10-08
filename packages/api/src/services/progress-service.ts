import {
  buildProgressSummary,
  buildProgressMessage,
  monthKeyOf,
  addMonths,
  monthLabel,
  tierForTotal,
} from '@club/shared';
import type { TenantConfig, CustomerRewardDto } from '@club/shared';
import type { Repositories } from '../repositories/types';
import type { Clock } from '../lib/clock';
import type { ProgramService } from './program-service';
export class ProgressService {
  constructor(
    private readonly repo: Repositories,
    private readonly program: ProgramService,
    private readonly tenant: TenantConfig,
    private readonly clock: Clock,
    private readonly host: string,
  ) {}
  async get(
    ci: string,
    month = monthKeyOf(this.clock.now()),
    width: 32 | 40 | 48 = 40,
    newRewards: CustomerRewardDto[] = [],
    businessId?: string,
  ) {
    const { streaks } = await this.program.get();
    const selected = businessId
      ? streaks.filter((s) => s.businessIds.includes(businessId))
      : streaks;
    const progress = await Promise.all(
      selected.map(async (def) => {
        const history = await this.repo.history(ci, def.streakId);
        const summary = buildProgressSummary(def, history, month, this.clock.now());
        const receipt = buildProgressMessage({
          displayName: this.tenant.displayName,
          summary,
          newRewards: newRewards.filter((r) => def.tiers.some((t) => t.tierId === r.tierId)),
          hasEarlierPurchases: history.some((h) => h.monthKey < month),
          appHost: this.host,
          width,
        });
        summary.message = receipt.message;
        return { summary, receipt };
      }),
    );
    return {
      progress: progress.map((p) => p.summary),
      receipt: progress[0]?.receipt ?? { message: '', lines: [] },
    };
  }
  async history(ci: string, months: number) {
    const { streaks } = await this.program.get();
    const def = streaks[0];
    if (!def) return [];
    const history = await this.repo.history(ci, def.streakId);
    const now = monthKeyOf(this.clock.now());
    return Array.from({ length: months }, (_, i) => {
      const month = addMonths(now, -i);
      const item = history.find((h) => h.monthKey === month);
      return {
        monthKey: month,
        monthLabel: monthLabel(month),
        totalCents: item?.totalCents ?? 0,
        purchaseCount: item?.purchaseCount ?? 0,
        tier: tierForTotal(def, item?.totalCents ?? 0),
      };
    });
  }
}
