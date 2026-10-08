import type { ProgressSummary, CustomerRewardDto, Receipt } from '../program/types';
import { formatMoney } from './money';
export function asciiFold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f¡¿]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');
}
export function wrapLines(text: string, width: number) {
  const result: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      result.push(line);
      line = '';
    }
    let remaining = word;
    while (remaining.length > width) {
      if (line) {
        result.push(line);
        line = '';
      }
      result.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    line += (line ? ' ' : '') + remaining;
  }
  if (line) result.push(line);
  return result;
}
export function renderReceiptLines(
  brandName: string,
  ligaName: string,
  summary: ProgressSummary,
  paragraphs: string[],
  width: 32 | 40 | 48 = 40,
) {
  const row = (left: string, right: string) =>
    left + ' '.repeat(Math.max(1, width - left.length - right.length)) + right;
  const next = summary.nextTier;
  const title = asciiFold(`${brandName} - ${ligaName}`.toUpperCase());
  const filled = next
    ? Math.min(20, Math.floor((20 * summary.totalCents) / next.minMonthlyCents))
    : 20;
  const bar = '[' + '#'.repeat(filled) + '-'.repeat(20 - filled) + ']';
  return [
    '-'.repeat(width),
    ' '.repeat(Math.max(0, Math.floor((width - title.length) / 2))) + title,
    row(
      'Mes: ' + asciiFold(summary.monthLabel.toUpperCase()),
      'Nivel: ' + (summary.currentTier?.name.toUpperCase() ?? '-'),
    ),
    row(
      'Acumulado: ' + formatMoney(summary.totalCents),
      'Faltan: ' + formatMoney(next?.gapCents ?? 0),
    ),
    row(bar, next?.name.toUpperCase() ?? summary.currentTier?.name.toUpperCase() ?? '-'),
    ...paragraphs.flatMap((p) => wrapLines(asciiFold(p), width)),
    '-'.repeat(width),
  ].flatMap((line) => (line.length > width ? wrapLines(line, width) : [line]));
}
export function buildProgressMessage(input: {
  brandName: string;
  ligaName: string;
  summary: ProgressSummary;
  newRewards?: CustomerRewardDto[];
  hasEarlierPurchases?: boolean;
  appHost?: string;
  width?: 32 | 40 | 48;
}): Receipt {
  const {
    brandName,
    ligaName,
    summary: s,
    newRewards = [],
    hasEarlierPurchases = false,
    appHost = 'el club',
    width = 40,
  } = input;
  const titles = newRewards.map(
    (r) => r.benefit?.title ?? 'tu recompensa ' + r.tierName.toLowerCase(),
  );
  const joined =
    titles.length < 2
      ? titles.join('')
      : titles.slice(0, -1).join(', ') + ' y ' + (titles.at(-1) ?? '');
  const rewards = newRewards.length
    ? `¡Felicitaciones! Desbloqueaste ${joined}. ` +
      (newRewards.length === 1
        ? `Código: ${newRewards[0]?.code}.`
        : `Revisa tus códigos en ${appHost}.`)
    : '';
  const total = formatMoney(s.totalCents);
  const next = s.nextTier;
  const progress = next
    ? (s.currentTier
        ? '¡Vas por buen camino!'
        : hasEarlierPurchases
          ? '¡Sigue sumando!'
          : `¡Bienvenido a ${brandName}!`) +
      ` Llevas ${total} este mes. ` +
      (s.currentTier ? 'Solo te faltan ' : 'Te faltan ') +
      `${formatMoney(next.gapCents)} para llegar a ${next.name.toUpperCase()} y ganar ${next.receiptTeaser}.`
    : `¡Eres ${s.currentTier?.name.toUpperCase() ?? 'MIEMBRO'} este mes! Llevas ${total}.`;
  const current = s.tiers.find((t) => t.tierId === s.currentTier?.tierId);
  const retaining = current?.rewards.find(
    (r) => r.requiredConsecutiveMonths > 1 && !r.unlockedThisMonth,
  );
  const risk = [...s.tiers]
    .reverse()
    .find(
      (t) =>
        t.streak.status === 'AT_RISK' && t.rewards.some((r) => r.requiredConsecutiveMonths > 1),
    );
  const streak = retaining
    ? `Racha ${current?.name.toUpperCase()}: mes ${retaining.progressInCycle} de ${retaining.requiredConsecutiveMonths}. ¡Mantén tu nivel el próximo mes!`
    : risk
      ? `¡No pierdas tu racha ${risk.name.toUpperCase()}! Te faltan ${formatMoney(risk.minMonthlyCents - s.totalCents)} antes de fin de mes.`
      : '';
  const paragraphs = [rewards, progress, streak].filter(Boolean);
  return {
    message: paragraphs.join(' '),
    lines: renderReceiptLines(brandName, ligaName, s, paragraphs, width),
  };
}
