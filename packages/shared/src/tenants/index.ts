import { ecoclub } from './ecoclub';
import { farmaclub } from './farmaclub';
import type { TenantId } from './types';
export const TENANTS = { ecoclub, farmaclub };
export function getTenant(id: TenantId) {
  return TENANTS[id];
}
export * from './types';
