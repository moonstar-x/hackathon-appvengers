export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra?: { details?: unknown; reason?: string },
  ) {
    super(message);
  }
}
