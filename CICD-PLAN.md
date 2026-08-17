# Pipeline Radar — AWS CI/CD Plan (CDK + GitHub OIDC + S3/CloudFront + ECS Fargate)

> **Status (2026-08-16, branch `feature/aws-cicd`):** steps 1, 2, 4 and 5 are
> implemented — `api/` proxy (8 jest tests, verified end-to-end locally through
> the Vite dev proxy against the live registry), `cdk/` (3 stacks, `synth`
> clean with no AWS creds), `ci.yml` + `deploy.yml`. Remaining: step 3, the
> one-time manual bootstrap — `cdk bootstrap`, deploy `PipelineRadarGithubOidc`,
> set the output ARN as the `AWS_DEPLOY_ROLE_ARN` repo variable, first manual
> `cdk deploy --all` — and merging the milestone branches into `main`.

## Target architecture

```
GitHub (push to main)
  └─ GitHub Actions ──OIDC──> AWS deploy role ──> cdk deploy
                                                    │
        ┌───────────────────────────────────────────┴──────────────┐
        ▼                                                          ▼
  Web stack                                                  API stack
  S3 (private) ◄─OAC─ CloudFront ─── /api/* behavior ───► ALB ─► ECS Fargate
  (Vite dist/)        (default *)                              (Node proxy,
                                                                ECR image)
                                                                  │
                                              ClinicalTrials.gov, openFDA, RxNorm
```

- **Frontend**: Vite build output in a private S3 bucket, served through CloudFront
  with Origin Access Control. SPA routing: 403/404 → `/index.html` (200).
- **API proxy** (new `api/` service, Node + Express): routes
  `/api/ctgov/*`, `/api/openfda/*`, `/api/rxnorm/*` → upstream APIs, with an
  in-memory TTL cache. Solves CORS for good, hides openFDA's 1k req/day limit
  behind a shared cache, and gives one place for retries/backoff.
- **Routing**: one CloudFront distribution, two origins. Default behavior → S3;
  `/api/*` → ALB origin (HTTPS to ALB is skipped — CloudFront→ALB over HTTP,
  ALB security group locked to CloudFront's managed prefix list). Frontend
  fetches relative `/api/...`, so no cross-origin config and no env-specific URLs
  baked into the bundle.
- **Fargate sizing**: 1 task, 0.25 vCPU / 512 MB, public-subnet with public IP
  (no NAT gateway — saves ~$32/mo), CloudWatch logs, `/healthz` for ALB checks.
- **Single environment (prod)**, default CloudFront URL. Stacks take an `envName`
  prop so a dev environment later is one more `new Stack(...)` line.

## Repo layout changes

```
api/                    ← new: Express proxy + Dockerfile + jest tests
cdk/                    ← new: CDK app (TypeScript)
  bin/app.ts
  lib/github-oidc-stack.ts   ← OIDC provider + deploy role (deployed once, manually)
  lib/api-stack.ts           ← VPC (public-only), cluster, ALB, Fargate service
  lib/web-stack.ts           ← S3, CloudFront (both origins), BucketDeployment
pipeline-radar/         ← existing frontend (unchanged except /api base path)
.github/workflows/
  ci.yml                ← PRs: lint, typecheck, jest (frontend + api), build
  deploy.yml            ← push to main: CI jobs → cdk deploy --all
```

Two app stacks, not one: web-only changes (the common case) deploy in ~1 min of
asset sync + invalidation without touching ECS; CDK skips the unchanged API stack.

## Auth: GitHub OIDC, no stored keys

`GithubOidcStack` (one-time manual deploy from a laptop with admin creds):

1. `iam.OpenIdConnectProvider` for `token.actions.githubusercontent.com`.
2. `deploy-role` with a trust policy scoped to
   `repo:dsl2022/interview-blue-matter:ref:refs/heads/main` (exact branch — PRs
   from forks can never assume it).
3. Permissions: `sts:AssumeRole` on the CDK bootstrap roles
   (`cdk-*-deploy-role`, `-file-publishing-role`, `-image-publishing-role`,
   `-lookup-role`) — CDK does the actual work through those, so the GitHub role
   itself stays tiny.

The role ARN goes in a GitHub **repo variable** (`AWS_DEPLOY_ROLE_ARN`). No
secrets anywhere in the pipeline.

## Workflows

**ci.yml** — `pull_request` + `push: main`:
- frontend job: `npm ci`, `oxlint`, `tsc -b`, `jest`, `vite build`
- api job: `npm ci`, `jest`, `docker build` (build only, no push)
- cdk job: `npm ci`, `tsc`, `cdk synth` (catches infra errors pre-merge)

**deploy.yml** — `push: main`, `concurrency: deploy-prod` (queued, not parallel):
```yaml
permissions: { id-token: write, contents: read }
jobs:
  test:    # same three CI jobs, as a gate
  deploy:
    needs: test
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}, aws-region: us-east-1 }
      - run: npm ci && npm run build          # pipeline-radar → dist/
      - run: npx cdk deploy --all --require-approval never   # in cdk/
```
CDK handles the rest declaratively: `DockerImageAsset` builds + pushes the api
image to the bootstrap ECR repo, ECS does a rolling replacement gated on ALB
health checks, `BucketDeployment` syncs `dist/` to S3 and issues the CloudFront
invalidation.

## Delivery order (each step demoable on its own)

| Step | Deliverable | Verify |
|---|---|---|
| 1 | `api/` proxy + Dockerfile, frontend pointed at `/api` (Vite dev proxy locally) | app works locally through the proxy |
| 2 | `cdk/` app: OIDC, api, web stacks; `cdk synth` clean | synth output reviewed |
| 3 | One-time: `cdk bootstrap` + deploy `GithubOidcStack`; first manual `cdk deploy --all` | app live on CloudFront URL |
| 4 | `ci.yml` on a PR | green checks on PR |
| 5 | `deploy.yml`; push a visible change to main | change live, no human AWS access used |

## Rollback & safety

- **API**: ECS rolling deploy only shifts traffic on healthy checks; a bad image
  fails to stabilize and CloudFormation auto-rolls back the task definition.
- **Frontend**: hashed asset filenames mean old HTML keeps working during sync;
  bad deploy → revert commit, pipeline redeploys the old build (~2 min).
- **Infra**: everything is in git; `cdk diff` runs in the deploy log before apply.

## Cost (single prod env, us-east-1)

~**$26/mo**: ALB ~$16, Fargate task ~$9, S3/CloudFront/ECR/logs ~$1 at demo
traffic. The ALB is the biggest line item — accepted because the brief pins ECS
Fargate; the cheap alternative (Lambda + API Gateway for the proxy) is worth
naming in the interview as the cost-conscious variant.

## Prerequisites / open items

- Merge `recovered/milestones-2-4` into `main` first — the pipeline deploys
  `main`, which today only has Milestone 1.
- AWS account ID + region confirmation (plan assumes `us-east-1`).
- `cdk bootstrap` must run once in the account before step 3.
