import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

// One-time stack, deployed MANUALLY from a laptop with admin credentials
// (CICD-PLAN.md "Auth"). After this exists, GitHub Actions never needs stored
// AWS keys: the workflow exchanges its OIDC token for this role, and the role
// can only hand off to the CDK bootstrap roles, which do the actual work.

const GITHUB_REPO = 'dsl2022/interview-blue-matter';
const DEPLOY_REF = 'refs/heads/main'; // exact branch — fork PRs can never assume this role

export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GithubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'pipeline-radar-github-deploy',
      description: 'Assumed by GitHub Actions (OIDC) to run cdk deploy on push to main',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:ref:${DEPLOY_REF}`,
        },
      }),
    });

    // CDK does everything through its bootstrap roles; this role only needs to
    // assume them, so it stays tiny and reviewable.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: role.roleArn,
      description: 'Set this as the AWS_DEPLOY_ROLE_ARN repo variable in GitHub',
    });
  }
}
