import { App } from 'aws-cdk-lib';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { ApiStack } from '../lib/api-stack';
import { WebStack } from '../lib/web-stack';

// Three stacks (CICD-PLAN.md):
// - PipelineRadarGithubOidc: deployed ONCE, manually, with admin creds.
// - PipelineRadarApi / PipelineRadarWeb: deployed by CI on push to main.
//   Two app stacks so a web-only change never touches ECS.
// Stacks are env-agnostic so `cdk synth` needs no AWS credentials; the
// deploy role/CLI supplies account+region at deploy time.

const app = new App();

new GithubOidcStack(app, 'PipelineRadarGithubOidc');

const api = new ApiStack(app, 'PipelineRadarApi', { envName: 'prod' });

new WebStack(app, 'PipelineRadarWeb', {
  envName: 'prod',
  apiLoadBalancer: api.loadBalancer,
});
