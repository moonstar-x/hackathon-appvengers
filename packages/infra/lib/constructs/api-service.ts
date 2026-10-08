import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Runtime, Architecture, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpStage, LogGroupLogDestination } from 'aws-cdk-lib/aws-apigatewayv2';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { resolve } from 'node:path';
import type { DataTables } from './data-tables';
export class ApiService extends Construct {
  readonly fn: NodejsFunction;
  readonly httpApi: HttpApi;
  readonly jwtSecret: Secret;
  readonly posSecret: Secret;
  constructor(scope: Construct, id: string, stage: 'dev' | 'prod', data: DataTables) {
    super(scope, id);
    this.jwtSecret = new Secret(this, 'JwtSecret', {
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    this.posSecret = new Secret(this, 'PosApiKey', {
      generateSecretString: { passwordLength: 40, excludePunctuation: true },
    });
    const logs = new LogGroup(this, 'LambdaLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.fn = new NodejsFunction(this, 'Api', {
      entry: resolve(import.meta.dirname, '../../../api/src/lambda.ts'),
      depsLockFilePath: resolve(import.meta.dirname, '../../../../pnpm-lock.yaml'),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      logGroup: logs,
      tracing: Tracing.ACTIVE,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        minify: true,
        sourceMap: true,
        mainFields: ['module', 'main'],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        STAGE: stage,
        DATA_DRIVER: 'dynamodb',
        JWT_SECRET_ARN: this.jwtSecret.secretArn,
        POS_API_KEY_SECRET_ARN: this.posSecret.secretArn,
        NODE_OPTIONS: '--enable-source-maps',
        ...Object.fromEntries(
          Object.entries(data.tables).map(([key, table]) => [key, table.tableName]),
        ),
      },
    });
    for (const [key, table] of Object.entries(data.tables)) {
      if (key === 'TABLE_BUSINESSES' || key === 'TABLE_STREAKS') table.grantReadData(this.fn);
      else table.grantReadWriteData(this.fn);
    }
    this.jwtSecret.grantRead(this.fn);
    this.posSecret.grantRead(this.fn);
    this.httpApi = new HttpApi(this, 'HttpApi', {
      createDefaultStage: false,
      defaultIntegration: new HttpLambdaIntegration('Express', this.fn),
    });
    const accessLogs = new LogGroup(this, 'AccessLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    new HttpStage(this, 'DefaultStage', {
      httpApi: this.httpApi,
      autoDeploy: true,
      throttle: { rateLimit: 100, burstLimit: 200 },
      accessLogSettings: {
        destination: new LogGroupLogDestination(accessLogs),
        format: AccessLogFormat.custom(
          '{"requestId":"$context.requestId","status":"$context.status","responseLength":"$context.responseLength"}',
        ),
      },
    });
  }
}
