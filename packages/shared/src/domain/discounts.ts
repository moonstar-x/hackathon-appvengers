import type { BenefitDefinition } from '../program/types';

export interface DiscountResult {
  purchaseAmountCents: number;
  discountCents: number;
  capCents: number;
  capped: boolean;
}

export function isDiscountBenefit(b: BenefitDefinition): boolean {
  return ['PERCENT_DISCOUNT', 'SPECIAL_DAYS_DISCOUNT', 'FIXED_DISCOUNT'].includes(b.type);
}

export function computeDiscount(b: BenefitDefinition, purchaseAmountCents: number): DiscountResult {
  if (
    !Number.isInteger(purchaseAmountCents) ||
    purchaseAmountCents < 1 ||
    purchaseAmountCents > 1_000_000
  )
    throw new Error('Invalid purchase amount');
  if (!isDiscountBenefit(b)) throw new Error('Not a discount benefit');
  const fixed = b.type === 'FIXED_DISCOUNT';
  const capCents = fixed ? b.amountCents : b.maxDiscountCents;
  if (!capCents || !Number.isInteger(capCents) || capCents < 1 || capCents > 1_000_000)
    throw new Error('Invalid discount cap');
  if (!fixed && (!b.percent || !Number.isInteger(b.percent) || b.percent < 1 || b.percent > 100))
    throw new Error('Invalid discount percent');
  const raw = fixed
    ? purchaseAmountCents
    : Math.floor((purchaseAmountCents * (b.percent ?? 0)) / 100);
  return {
    purchaseAmountCents,
    discountCents: Math.min(raw, capCents),
    capCents,
    capped: !fixed && raw > capCents,
  };
}
