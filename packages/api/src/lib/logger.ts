import pino from 'pino';
export function createLogger(level = 'info', destination?: pino.DestinationStream) {
  const options = {
    level,
    redact: {
      paths: [
        'ci',
        'email',
        'token',
        'key',
        'headers.authorization',
        'headers.x-api-key',
        'req.headers.authorization',
        'req.headers.x-api-key',
        'body',
        'req.body',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
