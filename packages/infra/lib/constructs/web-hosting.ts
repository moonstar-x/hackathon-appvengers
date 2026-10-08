import { Construct } from 'constructs';
import { RemovalPolicy, Duration, Stack } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  PriceClass,
  HttpVersion,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  ViewerProtocolPolicy,
  CachePolicy,
  OriginRequestPolicy,
  AllowedMethods,
  ResponseHeadersPolicy,
  HeadersFrameOption,
  HeadersReferrerPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin, HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source, CacheControl } from 'aws-cdk-lib/aws-s3-deployment';
import { OriginProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
export class WebHosting extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;
  constructor(
    scope: Construct,
    id: string,
    stage: 'dev' | 'prod',
    api: HttpApi,
    webAssetPath: string,
  ) {
    super(scope, id);
    this.bucket = new Bucket(this, 'Web', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: stage === 'prod',
      autoDeleteObjects: stage === 'dev',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    const rewrite = new CloudFrontFunction(this, 'SpaRewrite', {
      code: FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (!/\\.[^/]+$/.test(r.uri)) r.uri = '/index.html'; return r; }",
      ),
    });
    const headers = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          override: true,
        },
      },
    });
    const stack = Stack.of(this);
    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_ALL,
      httpVersion: HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: rewrite, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new HttpOrigin(`${api.apiId}.execute-api.${stack.region}.${stack.urlSuffix}`, {
            protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
          compress: true,
        },
      },
    });
    const assets = new BucketDeployment(this, 'DeployAssets', {
      sources: [Source.asset(webAssetPath)],
      destinationBucket: this.bucket,
      prune: false,
      exclude: ['*'],
      include: ['assets/*'],
      cacheControl: [CacheControl.fromString('public, max-age=31536000, immutable')],
    });
    const entry = new BucketDeployment(this, 'DeployEntry', {
      sources: [Source.asset(webAssetPath)],
      destinationBucket: this.bucket,
      prune: false,
      exclude: ['assets/*'],
      cacheControl: [CacheControl.noCache()],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
    entry.node.addDependency(assets);
  }
}
