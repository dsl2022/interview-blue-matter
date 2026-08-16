import * as path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

// API proxy stack: VPC (public subnets only — no NAT gateway, ~$32/mo saved;
// the task gets a public IP for its outbound calls to the public APIs),
// one 0.25 vCPU Fargate task behind an internet-facing ALB.
//
// The ALB listens on plain HTTP but its security group only admits traffic
// from CloudFront's origin-facing IP ranges (managed prefix list), so the
// only path to it is through the distribution (CICD-PLAN.md "Routing").

export interface ApiStackProps extends StackProps {
  envName: string;
  /**
   * Managed prefix list id for com.amazonaws.global.cloudfront.origin-facing
   * in the deployment region. Default is the us-east-1 id; override via
   * `-c cloudfrontPrefixListId=pl-...` for other regions
   * (`aws ec2 describe-managed-prefix-lists` to find it).
   */
  cloudfrontPrefixListId?: string;
}

const US_EAST_1_CLOUDFRONT_ORIGIN_FACING = 'pl-3b927c52';

export class ApiStack extends Stack {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const prefixListId =
      props.cloudfrontPrefixListId ??
      (this.node.tryGetContext('cloudfrontPrefixListId') as string | undefined) ??
      US_EAST_1_CLOUDFRONT_ORIGIN_FACING;

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const image = new ecrAssets.DockerImageAsset(this, 'ApiImage', {
      directory: path.join(__dirname, '..', '..', 'api'),
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    taskDefinition.addContainer('api', {
      image: ecs.ContainerImage.fromDockerImageAsset(image),
      portMappings: [{ containerPort: 3001 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true, // public subnet + no NAT: this is the outbound path
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { rollback: true }, // bad image -> auto rollback, no dead prod
      minHealthyPercent: 100,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'ALB — reachable only from CloudFront origin-facing ranges',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(prefixListId),
      ec2.Port.tcp(80),
      'CloudFront origin-facing only',
    );

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    const listener = this.loadBalancer.addListener('Http', { port: 80, open: false });
    listener.addTargets('Api', {
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/healthz',
        interval: Duration.seconds(30),
        healthyThresholdCount: 2,
      },
      deregistrationDelay: Duration.seconds(10),
    });

    new CfnOutput(this, 'AlbDnsName', { value: this.loadBalancer.loadBalancerDnsName });
  }
}
