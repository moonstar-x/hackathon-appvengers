export function normalizeCi(input: string) {
  return input.replace(/[\s-]/g, '');
}
export function makeValidCi(prefix9: string) {
  if (!/^\d{9}$/.test(prefix9)) throw new Error('Se requieren nueve dígitos');
  const sum = Array.from(prefix9).reduce((n, digit, i) => {
    const p = Number(digit) * (i % 2 === 0 ? 2 : 1);
    return n + (p > 9 ? p - 9 : p);
  }, 0);
  return prefix9 + String((10 - (sum % 10)) % 10);
}
export function isValidCi(ci: string) {
  if (!/^\d{10}$/.test(ci)) return false;
  const province = Number(ci.slice(0, 2));
  return (
    ((province >= 1 && province <= 24) || province === 30) &&
    Number(ci[2]) < 6 &&
    makeValidCi(ci.slice(0, 9)) === ci
  );
}
export function maskCi(ci: string) {
  return ci.slice(0, 2) + '******' + ci.slice(-2);
}
