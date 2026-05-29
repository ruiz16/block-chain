# Proposal: Deployment Configuration

## Intent

Zero deployment infrastructure — no Docker, CI/CD, Vercel config, or documented production env vars. Every deploy is manual and tribal. This change establishes base tooling so any team member can ship confidently.

## Scope

- **In**: Dockerfile (multi-stage), docker-compose.yml, vercel.json, .env.production.example, CI (`ci.yml`), CD (`deploy.yml`), DEPLOY.md
- **Out**: Kubernetes, staging env, Sentry, DB migration automation, e2e tests

## Capabilities

None — infrastructure/config only, no spec-level features or requirement changes.

## Approach

- **Docker**: `node:20-alpine`, 3 stages (deps→builder→runner), Next.js standalone output. `.dockerignore` excludes `.env*`
- **docker-compose**: App on `:3000`, commented Supabase local stack
- **vercel.json**: Framework nextjs, passthrough rewrites
- **Env template**: Extend `.env.local.example` → `.env.production.example`, add `NODE_ENV=production`, document public vs secret vars
- **CI**: PR→main, `tsc --noEmit` + `next lint`, `setup-node@v4`
- **CD**: Push→main, `npx vercel --prod`, secrets from GitHub
- **DEPLOY.md**: 3 sections — Vercel, Docker, Env reference

## Affected Areas

| Area | Impact |
|------|--------|
| `Dockerfile`, `docker-compose.yml`, `vercel.json`, `.env.production.example`, `DEPLOY.md` | New |
| `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | New |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Token exposed in CI | Med | Encrypted secrets; never log |
| Docker includes `.env*` | Med | `.dockerignore` |
| Wrong RPC in prod | Low | Validate at startup |
| Dep update breaks CI | Low | Lockfile pinned |

## Rollback Plan

- **Docker**: `docker compose down && docker rmi` — stateless
- **Vercel**: Restore prior deployment (one-click)
- **CI/CD**: Delete workflow files — no runtime effect
- **Env template**: Delete file — no runtime effect

## Dependencies

Node.js 20+, Vercel account + project, `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` in GitHub secrets

## Success Criteria

- [ ] `docker compose up --build` serves app on `:3000`
- [ ] Vercel deploys with no 404s on App Router routes
- [ ] `.env.production.example` covers every required var
- [ ] CI fails on type errors / lint violations
- [ ] CD auto-deploys on merge to main
- [ ] New dev can follow DEPLOY.md and ship in < 30 min
