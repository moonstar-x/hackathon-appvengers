import type { ProgramConfig, StreakDefinition } from './types';
export const PROGRAM: ProgramConfig = {
  id: 'smartclub',
  displayName: 'SmartClub 2.0',
  shortName: 'SmartClub',
  stackName: 'SmartClub',
  groupName: 'Farmaenlace',
  tagline: 'Tus compras suman. Tu constancia gana.',
  rewardCodePrefix: 'SC',
  theme: {
    'brand-primary': '#ff3e00',
    'brand-primary-strong': '#b83300',
    'brand-on-strong': '#f9f4e1',
    'brand-secondary': '#b80f62',
    'brand-accent': '#ff009e',
    'brand-deep': '#9e0412',
    'brand-warm': '#fe9c01',
    'brand-soft': '#f7f1d6',
    'brand-dark': '#171717',
    'brand-gradient': 'linear-gradient(135deg,#ff3e00 0%,#ff6700 60%,#fe9c01 100%)',
    surface: '#f9f4e1',
    'surface-raised': '#ffffff',
    'surface-muted': '#f7f1d6',
    ink: '#171717',
    'ink-muted': '#57534e',
    line: '#857b74',
    'line-subtle': '#e6dcc0',
    danger: '#c8102e',
    success: '#1d7a3e',
    'tier-bronze': '#c27c3a',
    'tier-silver': '#b3b3b1',
    'tier-gold': '#f2b705',
  },
  businesses: [
    {
      businessId: 'farmacias-economicas',
      name: 'Farmacias Económicas',
      brand: 'Económicas',
      category: 'PHARMACY',
      description: 'Suma tus compras en Farmacias Económicas',
      active: true,
    },

    {
      businessId: 'medicity',
      name: 'Medicity',
      brand: 'Medicity',
      category: 'PHARMACY',
      description: 'Suma tus compras en Medicity',
      active: true,
    },
    {
      businessId: 'wellderma',
      name: 'Wellderma',
      brand: 'Wellderma',
      category: 'DERMOCOSMETICS',
      description: 'Suma tus compras en Wellderma',
      active: true,
    },
    {
      businessId: 'mascotas',
      name: 'Mascotas',
      brand: 'Mascotas',
      category: 'PETS',
      description: 'Suma tus compras en Mascotas',
      active: true,
    },
    {
      businessId: 'ambiente',
      name: 'Ambiente',
      brand: 'Ambiente',
      category: 'HOME',
      description: 'Suma tus compras en Ambiente',
      active: true,
    },
  ],
  streaks: [
    {
      streakId: 'liga-ahorro',
      name: 'Liga Ahorro',
      displayOrder: 1,
      description: 'Cada compra suma. Mantén tu nivel y desbloquea beneficios.',
      period: 'CALENDAR_MONTH',
      timeZone: 'America/Guayaquil',
      businessIds: ['farmacias-economicas'],
      active: true,
      version: 2,
      tiers: [
        {
          tierId: 'BRONZE',
          name: 'Bronce',
          minMonthlyCents: 1000,
          receiptTeaser: '5% de cashback (hasta $1) en tu próxima compra',
          rewards: [
            {
              rewardId: 'bronce-cashback',
              requiredConsecutiveMonths: 1,
              selection: 'ALL',
              validForMonths: 1,
              benefits: [
                {
                  benefitId: 'cashback',
                  type: 'PERCENT_DISCOUNT',
                  title: '5% de cashback, hasta $1',
                  description:
                    '5% de descuento en tu próxima compra, con un máximo de $1. Un solo uso.',
                  percent: 5,
                  maxDiscountCents: 100,
                },
              ],
            },
          ],
        },
        {
          tierId: 'SILVER',
          name: 'Plata',
          minMonthlyCents: 1500,
          receiptTeaser: 'un cupón de $2 o acceso anticipado a Días Especiales',
          rewards: [
            {
              rewardId: 'plata-eleccion',
              requiredConsecutiveMonths: 3,
              selection: 'ONE_OF',
              validForMonths: 2,
              benefits: [
                {
                  benefitId: 'acceso',
                  type: 'SPECIAL_DAYS_EARLY_ACCESS',
                  title: 'Acceso anticipado a Días Especiales',
                  description: 'Acceso anticipado a Días Especiales',
                },
                {
                  benefitId: 'cupon-2',
                  type: 'FIXED_DISCOUNT',
                  title: 'Cupón de $2',
                  description: 'Cupón de $2',
                  amountCents: 200,
                },
              ],
            },
          ],
        },
        {
          tierId: 'GOLD',
          name: 'Oro',
          minMonthlyCents: 2500,
          receiptTeaser: 'un cupón de envío a domicilio gratis',
          rewards: [
            {
              rewardId: 'oro-beneficios',
              requiredConsecutiveMonths: 3,
              selection: 'ALL',
              validForMonths: 2,
              benefits: [
                {
                  benefitId: 'dias-especiales',
                  type: 'SPECIAL_DAYS_DISCOUNT',
                  title: 'Hasta 25% en Días Especiales',
                  description:
                    'Hasta 25% de descuento en Días Especiales, con un máximo de $12,50. Un solo uso.',
                  percent: 25,
                  maxDiscountCents: 1250,
                },
                {
                  benefitId: 'envio',
                  type: 'FREE_DELIVERY',
                  title: 'Envío a domicilio gratis',
                  description: 'Envío a domicilio gratis',
                  monthlyInstallments: 3,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      streakId: 'liga-wellness',
      name: 'Liga Wellness',
      displayOrder: 2,
      description: 'Bienestar, belleza, hogar y mascotas: todas tus marcas suman.',
      period: 'CALENDAR_MONTH',
      timeZone: 'America/Guayaquil',
      businessIds: ['medicity', 'wellderma', 'mascotas', 'ambiente'],
      active: true,
      version: 2,
      tiers: [
        {
          tierId: 'BRONZE',
          name: 'Bronce',
          minMonthlyCents: 3000,
          receiptTeaser: '5% de cashback (hasta $3) y un café de cortesía',
          rewards: [
            {
              rewardId: 'bronce-bienestar',
              requiredConsecutiveMonths: 1,
              selection: 'ALL',
              validForMonths: 1,
              benefits: [
                {
                  benefitId: 'cashback',
                  type: 'PERCENT_DISCOUNT',
                  title: '5% de cashback, hasta $3',
                  description:
                    '5% de descuento en tu próxima compra, con un máximo de $3. Un solo uso.',
                  percent: 5,
                  maxDiscountCents: 300,
                },
                {
                  benefitId: 'cafe',
                  type: 'IN_STORE_PERK',
                  title: 'Café de cortesía en tu visita',
                  description: 'Café de cortesía en tu visita',
                },
              ],
            },
          ],
        },
        {
          tierId: 'SILVER',
          name: 'Plata',
          minMonthlyCents: 6000,
          receiptTeaser: 'consulta dermatológica exprés, muestras premium y Fast Track',
          rewards: [
            {
              rewardId: 'plata-bienestar',
              requiredConsecutiveMonths: 3,
              selection: 'ALL',
              validForMonths: 2,
              benefits: [
                {
                  benefitId: 'consulta',
                  type: 'IN_STORE_PERK',
                  title: 'Consulta dermatológica exprés',
                  description: 'Consulta dermatológica exprés',
                },
                {
                  benefitId: 'muestras',
                  type: 'IN_STORE_PERK',
                  title: 'Muestras médicas premium',
                  description: 'Muestras médicas premium de laboratorios aliados',
                },
                {
                  benefitId: 'fast-track',
                  type: 'IN_STORE_PERK',
                  title: 'Fila Fast Track en Medicity',
                  description: 'Fila Fast Track en Medicity',
                  businessIds: ['medicity'],
                },
              ],
            },
          ],
        },
        {
          tierId: 'GOLD',
          name: 'Oro',
          minMonthlyCents: 12000,
          receiptTeaser: 'una experiencia exclusiva para ti',
          rewards: [
            {
              rewardId: 'oro-experiencia',
              requiredConsecutiveMonths: 3,
              selection: 'ONE_OF',
              validForMonths: 2,
              benefits: [
                {
                  benefitId: 'diseno',
                  type: 'PARTNER_EXPERIENCE',
                  title: 'Asesoría de diseño de interiores',
                  description: 'Asesoría de diseño de interiores',
                  businessIds: ['ambiente'],
                },
                {
                  benefitId: 'grooming',
                  type: 'PARTNER_EXPERIENCE',
                  title: 'Sesión de grooming para tu mascota',
                  description: 'Sesión de grooming para tu mascota',
                  businessIds: ['mascotas'],
                },
                {
                  benefitId: 'byd',
                  type: 'PARTNER_EXPERIENCE',
                  title: 'Prueba de manejo BYD',
                  description: 'Fin de semana de prueba de manejo BYD',
                  partnerName: 'BYD',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
export function compareLigas(a: StreakDefinition, b: StreakDefinition) {
  return a.displayOrder - b.displayOrder || a.streakId.localeCompare(b.streakId);
}
