import { streakDefinitionSchema, businessSchema } from '@club/shared';
import type { StreakDefinition, BusinessDefinition } from '@club/shared';
import type { Repositories } from '../repositories/types';
import type { Clock } from '../lib/clock';
export class ProgramService {
  private cache?: { at: number; streaks: StreakDefinition[]; businesses: BusinessDefinition[] };
  constructor(
    private readonly repo: Repositories,
    private readonly clock: Clock,
  ) {}
  async get() {
    const now = this.clock.now().getTime();
    if (this.cache && now - this.cache.at < 60000) return this.cache;
    const [s, b] = await Promise.all([this.repo.streaks(), this.repo.businesses()]);
    const streaks = s.map((i) => streakDefinitionSchema.parse(i)).filter((i) => i.active);
    const businesses = b.map((i) => businessSchema.parse(i)).filter((i) => i.active);
    this.cache = { at: now, streaks, businesses };
    return this.cache;
  }
}
