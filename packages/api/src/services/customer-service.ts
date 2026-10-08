import { maskEmail, PRIVACY_POLICY_VERSION } from '@club/shared';
import type { Customer, CustomerDto } from '@club/shared';
import type { Repositories } from '../repositories/types';
import type { Clock } from '../lib/clock';
import { AppError } from '../lib/errors';
export function customerDto(c: Customer): CustomerDto {
  return {
    ci: c.ci,
    emailMasked: maskEmail(c.email),
    registeredAt: c.createdAt,
    registrationChannel: c.registrationChannel,
  };
}
export class CustomerService {
  constructor(
    private readonly repo: Repositories,
    private readonly clock: Clock,
  ) {}
  async require(ci: string) {
    const c = await this.repo.customer(ci);
    if (!c) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'No encontramos esa cédula');
    return c;
  }
  async register(
    input: {
      ci: string;
      email: string;
      channel: Customer['registrationChannel'];
      businessId?: string;
    },
    assisted = false,
  ) {
    const previous = await this.repo.customer(input.ci);
    if (previous) {
      if (!assisted) throw new AppError(409, 'CUSTOMER_EXISTS', 'Ya eres parte del club');
      return { customer: previous, registeredNow: false };
    }
    const now = this.clock.now().toISOString();
    const c: Customer = {
      ci: input.ci,
      email: input.email,
      registrationChannel: input.channel,
      registeredAtBusinessId: input.businessId,
      consent: {
        acceptedAt: now,
        policyVersion: PRIVACY_POLICY_VERSION,
        channel: assisted ? 'POS_VERBAL' : 'WEB_CHECKBOX',
      },
      createdAt: now,
      updatedAt: now,
    };
    if (await this.repo.createCustomer(c)) return { customer: c, registeredNow: true };
    if (!assisted) throw new AppError(409, 'CUSTOMER_EXISTS', 'Ya eres parte del club');
    return { customer: await this.require(input.ci), registeredNow: false };
  }
}
