import * as path from 'node:path';
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

// Web stack: private S3 bucket (OAC only — no public bucket policy, no
// website endpoint) behind CloudFront. One distribution, two origins:
// default -> S3 (the Vite build), /api/* -> the ALB from ApiStack. The
// frontend fetches relative /api/... so nothing environment-specific is ever
// baked into the bundle.
//
// NOTE: BucketDeployment reads ../pipeline-radar/dist at synth time — build
// the frontend before synth/deploy (the workflows do).

export interface WebStackProps extends StackProps {
  envName: string;
  apiLoadBalancer: elbv2.IApplicationLoadBalancer;
}

export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // Interview project: tearing down cleanly matters more than retention.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `pipeline-radar ${props.envName}`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(props.apiLoadBalancer.loadBalancerDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          // The proxy caches server-side; CloudFront must not double-cache
          // (and must forward query strings, which the API cache key needs).
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // SPA routing: unknown paths come back from S3/OAC as 403 — serve the
      // app shell and let the client router take it from there.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployWeb', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'pipeline-radar', 'dist'))],
      destinationBucket: bucket,
      distribution, // invalidates /* after sync
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'AppUrl', { value: `https://${distribution.domainName}` });
  }
}
