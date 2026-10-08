export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return local.slice(0, 1) + '*****' + (local.length > 1 ? local.slice(-1) : '') + '@' + domain;
}
