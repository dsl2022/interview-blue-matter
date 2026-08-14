# Pipeline Radar — CI/CD Implementation Plan (CDK + GitHub Actions)

> Companion to ARCHITECTURE.md. Scope: take the static Vite SPA from "runs on localhost"
> to an enterprise three-environment deployment pipeline with gated promotion.
> The app has **no backend** (browser → public APIs directly), so the deployable unit is
> a static bundle: S3 + CloudFront per environment, provisioned by CDK.

---

## 1. Environments & branch model (GitFlow, trimmed to what earns its keep)

| Branch | Environment | Deploy trigger | Gate |
|---|---|---|---|
| `feature/*` | — (CI only) | PR → `develop` | required status checks |
| `develop` | **dev** — `dev.pipeline-radar.<domain>` | auto on merge | none (fast feedback) |
| `release/x.y.z` | **staging** — `staging.…` | auto on push | QA sign-off happens here |
| `main` | **production** — apex/`www` | tag `vX.Y.Z` push after release merge | GitHub *production* environment: required reviewer + wait timer |
| `hotfix/*` | staging → prod | same as release path | same prod gate |

Flow: `feature/*` → PR → `develop` (auto-deploys dev) → cut `release/x.y.z` when ready
(auto-deploys staging; only bugfixes land on it) → PR `release/x.y.z` → `main` + tag `vX.Y.Z`
(deploys prod after manual approval) → back-merge `main` → `develop`. Hotfixes branch from
`main`, deploy to staging for verification, then follow the same tag-to-prod path and back-merge.

**Build once, promote the artifact.** The `dist/` bundle is built exactly once per commit in CI,
uploaded as a workflow artifact keyed by SHA, and the *same* bundle is deployed to every
environment. No env-specific rebuilds (the SPA has no per-env config today — if that changes,
inject at deploy time via a generated `config.json`, never a rebuild).

**Repo changes required (one-time):**
- Create `develop` from `main`; make it the default branch.
- Branch protection: `develop` and `main` require PRs, required checks (`ci`), no force-push;
  `main` additionally requires linear history and the production environment approval on deploy.
- `CODEOWNERS`: `infra/` and `.github/workflows/` require review from repo owner.
- GitHub *environments*: `dev`, `staging`, `production` (reviewer required on `production` only).

## 2. AWS layout & auth (no long-lived secrets)

- **Accounts:** ideally dev/staging in a non-prod account, prod in its own; single-account with
  three stacks is acceptable for now — the CDK code is identical either way, only `env` props change.
- **Auth: GitHub OIDC → IAM.** One IAM role per environment (`gha-deploy-dev|staging|prod`),
  trust policy scoped to `repo:dsl2022/interview-blue-matter` **and** the specific ref/environment
  (`environment:production` claim for prod). No `AWS_ACCESS_KEY_ID` secrets anywhere.
- Role permissions: CDK deploy via the bootstrap roles (`cdk bootstrap` per account/region;
  roles assume `cdk-*-deploy-role` etc.), not broad admin.

## 3. CDK app — `infra/`

```
infra/
  bin/app.ts              ← three stack instances: Dev, Staging, Prod
  lib/static-site-stack.ts← the one stack class, parameterized
  lib/config.ts           ← per-env props (domain, retention, protections)
  test/                   ← CDK assertions (Template.fromStack) — synth-level unit tests
```

`StaticSiteStack` (same class, three instantiations):
- **S3 bucket** — private, block-all-public, versioned (rollback = point CloudFront at prior
  object versions is overkill; versioning is for forensics), `RemovalPolicy.DESTROY` in dev,
  `RETAIN` in prod.
- **CloudFront** — OAC (not legacy OAI) to the private bucket, `defaultRootObject: index.html`,
  SPA fallback: 403/404 → `/index.html` 200 (client-side routing safe), HTTP→HTTPS redirect,
  compression on. Response-headers policy: HSTS, `X-Content-Type-Options`, CSP allowing
  `connect-src` to the four public API hosts only.
- **Cache strategy matching Vite's output:** hashed assets (`assets/*`) → long TTL immutable;
  `index.html` → `no-cache` (deploy = upload + invalidate `/index.html` only, cheap and instant).
- **Domain (optional, config-gated):** Route53 alias + ACM cert (us-east-1) when a hosted zone
  is configured; stacks work without it (CloudFront default domain) so the pipeline never blocks
  on DNS.
- **Outputs:** distribution ID + URL (consumed by the deploy workflow for invalidation + smoke test).

Deployment of the bundle itself: `s3 sync dist/ s3://bucket --delete` + targeted invalidation in
the workflow, **not** `BucketDeployment` — keeps CDK deploys (infra changes, rare) decoupled from
app deploys (every merge), so the common path is a 30-second sync, not a CloudFormation update.

## 4. GitHub Actions — `.github/workflows/`

### `ci.yml` — every PR + every push to `develop`, `release/**`, `main`
1. checkout, setup-node 24 with npm cache
2. `npm ci` (app + infra workspaces)
3. lint (oxlint) · `tsc -b` · `jest` (app) · `jest` (infra CDK assertions)
4. `vite build` → upload `dist-${{ github.sha }}` artifact (14-day retention)
5. `cdk synth` (validates infra compiles; no deploy, no AWS creds needed — synth offline)

`ci` is the single required status check everywhere.

### `deploy.yml` — reusable workflow (called by the three below)
Inputs: `environment`, `artifact-ref`. Steps: download artifact → OIDC assume env role →
`cdk deploy PipelineRadar-<Env> --require-approval never` (no-ops when infra unchanged) →
`aws s3 sync` → invalidate `/index.html` → **smoke test**: curl the distribution URL, assert
HTTP 200 + `<title>Pipeline Radar</title>`; fail the job (and alert) if not.
`concurrency: deploy-<env>` (no overlapping deploys, no cancel-in-progress for prod).

### Triggers
- `deploy-dev.yml`: push to `develop` → `deploy(dev)` with that SHA's artifact.
- `deploy-staging.yml`: push to `release/**` → `deploy(staging)`.
- `deploy-prod.yml`: push of tag `v*` → `deploy(production)` — pauses on the GitHub environment
  reviewer gate; the artifact deployed is the one built for the tagged SHA (verified staging bits).
- `rollback.yml`: `workflow_dispatch` with a prior tag input → re-runs `deploy(production)` with
  that tag's artifact (or rebuilds it deterministically from the tag if retention expired).
  Rollback is therefore "redeploy last good tag," one click, no git surgery.

## 5. Release & versioning

- SemVer tags on `main` only; `release/x.y.z` branch name fixes the version up front.
- Auto-generated release notes from PR titles (GitHub Releases on tag push).
- `CHANGELOG` = the Releases page; don't maintain a file by hand.

## 6. Implementation phases (each is a PR, in order)

| Phase | Deliverable | Proof it works |
|---|---|---|
| 0 | `develop` branch, protections, environments, CODEOWNERS | settings screenshots / `gh api` |
| 1 | `ci.yml` on the current repo | red on a broken test, green on `develop` |
| 2 | `infra/` CDK app + assertion tests, `cdk synth` in CI | synth passes in CI with no creds |
| 3 | AWS bootstrap + OIDC roles; `deploy-dev` live | merge to `develop` → dev URL serves the app |
| 4 | staging trigger + reusable workflow refactor | `release/0.1.0` push → staging URL |
| 5 | prod gate + tag deploy + rollback workflow | `v0.1.0` tag → approval pause → prod URL; rollback drill to `v0.0.x` |
| 6 | Hardening: CSP/headers policy, smoke-test alerting, budget alarm, Dependabot on actions + npm | headers visible in curl; forced smoke-fail alerts |

Phases 0–2 need no AWS account and could land today. Phase 3 is the first real-money step
(cost at this traffic: well under $5/mo for all three envs).

## 7. Decisions & tradeoffs (pre-argued)

- **CDK stacks-per-env over CDK Pipelines (the construct):** CDK Pipelines couples deployment to
  CodePipeline; the org standard here is GitHub Actions, and GHA-with-OIDC is simpler, cheaper,
  and keeps one CI system. Revisit only if cross-account promotion outgrows OIDC roles.
- **`s3 sync` over `BucketDeployment`:** app deploys shouldn't be CloudFormation events.
- **Tag-triggered prod over merge-triggered:** merge and deploy are separate decisions in an
  enterprise flow; the tag is the auditable "ship it" act, and the reviewer gate sits on top.
- **GitFlow over trunk-based:** chosen because the ask is a staged release process with QA on a
  release branch. If the team later wants continuous deployment, collapse to trunk-based by
  retiring `release/*` and pointing staging at `main` — the workflows are already structured so
  only the trigger blocks change.
- **No backend keeps this honest:** if a proxy/backend ever appears (e.g. for API keys), it becomes
  a second CDK stack behind the same branch/environment model; nothing in this plan is invalidated.
