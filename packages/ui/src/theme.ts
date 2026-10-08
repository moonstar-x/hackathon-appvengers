import { getTenant } from '@club/shared';
import type { TenantConfig } from '@club/shared';
export const tenant = getTenant(
  import.meta.env.VITE_TENANT === 'farmaclub' ? 'farmaclub' : 'ecoclub',
);
export function applyTheme(config: TenantConfig, element = document.documentElement) {
  for (const [key, value] of Object.entries(config.theme))
    element.style.setProperty('--' + key, value);
}
