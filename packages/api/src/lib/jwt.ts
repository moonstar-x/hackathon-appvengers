import { SignJWT, jwtVerify } from 'jose';
export class Sessions {
  private readonly key: Uint8Array;
  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }
  async issue(ci: string, now: Date) {
    return new SignJWT({})
      .setIssuer('smartclub')
      .setAudience('smartclub')
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(ci)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 30 * 86400)
      .sign(this.key);
  }
  async verify(token: string, now: Date) {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: 'smartclub',
      audience: 'smartclub',
      currentDate: now,
    });
    if (!payload.sub) throw new Error('Invalid session');
    return payload.sub;
  }
}
