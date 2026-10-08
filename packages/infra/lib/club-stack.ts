import { Stack, CfnOutput, Tags } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { resolve } from 'node:path';
import { TABLE_SPECS } from '@club/shared';
import type { ProgramConfig } from '@club/shared';
import { DataTables } from './constructs/data-tables';
import { ApiService } from './constructs/api-service';
import { WebHosting } from './constructs/web-hosting';
export interface ClubStackProps extends StackProps {
  program: ProgramConfig;
  stage: 'dev' | 'prod';
  webAssetPath?: string;
}
export class ClubStack extends Stack {
  constructor(scope: Construct, id: string, props: ClubStackProps) {
    super(scope, id, props);
    const data = new DataTables(this, 'Data', props.stage);
    const api = new ApiService(this, 'Api', props.stage, data);
    const web = new WebHosting(
      this,
      'Web',
      props.stage,
      api.httpApi,
      props.webAssetPath ?? resolve(import.meta.dirname, '../../ui/dist'),
    );
    api.fn.addEnvironment('APP_PUBLIC_HOST', web.distribution.distributionDomainName);
    new CfnOutput(this, 'WebUrl', { value: 'https://' + web.distribution.distributionDomainName });
    new CfnOutput(this, 'ApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'PosApiKeySecretArn', { value: api.posSecret.secretArn });
    new CfnOutput(this, 'JwtSecretArn', { value: api.jwtSecret.secretArn });
    for (const spec of TABLE_SPECS)
      new CfnOutput(this, spec.logicalName + 'TableName', {
        value: data.tables[spec.env].tableName,
      });
    Tags.of(this).add('app', 'smartclub');
    Tags.of(this).add('stage', props.stage);
  }
}
