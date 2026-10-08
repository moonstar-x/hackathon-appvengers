import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
const cache = new Map<string, Promise<string>>();
export function getSecret(arn: string) {
  let value = cache.get(arn);
  if (!value) {
    value = new SecretsManagerClient({})
      .send(new GetSecretValueCommand({ SecretId: arn }))
      .then((r) => {
        if (!r.SecretString) throw new Error('SecretString missing');
        return r.SecretString;
      });
    cache.set(arn, value);
  }
  return value;
}
