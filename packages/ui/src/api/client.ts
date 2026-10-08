import { errorEnvelopeSchema } from '@club/shared';
import { tenant } from '../theme';
let token: string | null = null;
const storageKey = tenant.id + '-session';
export function loadSession() {
  try {
    token = localStorage.getItem(storageKey);
  } catch {
    token = null;
  }
  return token;
}
export function saveSession(value: string | null) {
  token = value;
  try {
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
  } catch {
    /* Storage may be disabled. The current session still works. */
  }
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: { body?: unknown; pos?: { key: string; businessId: string }; method?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.pos) {
    headers['x-api-key'] = options.pos.key;
    headers['x-business-id'] = options.pos.businessId;
  }
  const response = await fetch('/api' + path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(data);
    if (response.status === 401 && !options.pos) {
      saveSession(null);
      window.dispatchEvent(new Event('club-session-expired'));
    }
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : 'INTERNAL_ERROR',
      parsed.success ? parsed.data.error.message : 'No pudimos completar la solicitud',
      parsed.success ? parsed.data.error.reason : undefined,
    );
  }
  return data as T;
}
