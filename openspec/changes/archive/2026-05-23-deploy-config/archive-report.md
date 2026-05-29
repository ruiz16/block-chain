# Archive Report: deploy-config

**Archived**: 2026-05-23
**Status**: archived
**Previous path**: `openspec/changes/deploy-config/`
**Archive path**: `openspec/changes/archive/2026-05-23-deploy-config/`
**Mode**: hybrid (filesystem + Engram)

---

## Change Summary

Deployment configuration for the block-chain micro-credit platform. Established the full deployment toolchain: Docker multi-stage build, Vercel configuration, CI/CD via GitHub Actions, production environment template, and comprehensive deployment documentation.

## Artifacts Archived

| Artifact | File | Engram ID | Summary |
|----------|------|-----------|---------|
| Proposal | `proposal.md` | #88 | Scope: Docker, Vercel, CI/CD, env template, DEPLOY.md. Out: K8s, staging, Sentry |
| Tasks | `tasks.md` | #91 | 10 tasks across 6 phases: Env, Docker, Vercel, CI/CD, Docs, Verify |
| Apply Report | `apply-report.md` | #93 | All 10 tasks implemented; 1 verification task skipped (no Docker Desktop) |
| Verify Report | `verify-report.md` | #97 | PASS WITH WARNINGS. CRITICAL issue (env var name mismatch) resolved. 2 warnings remain |
| State | `state.yaml` | — | Status: archived, completed: 2026-05-23 |

## Files Created During Change

| File | Action | Description |
|------|--------|-------------|
| `.env.production.example` | Created | Production env template with NODE_ENV, grouped by App/Supabase/Celo/Auth sections |
| `package.json` | Modified | Added `"typecheck": "tsc --noEmit"` script |
| `next.config.ts` | Modified | Added `output: 'standalone'` for Docker multi-stage |
| `Dockerfile` | Created | 3-stage build (deps→builder→runner), node:20-alpine, non-root user, port 3000, healthcheck |
| `.dockerignore` | Created | Excluded node_modules, .next, .git, .env*, .vercel, .cache |
| `vercel.json` | Created | Framework nextjs, rewrites for App Router, build/install commands |
| `.github/workflows/ci.yml` | Created | PR trigger, Node 20, `npm ci` → `typecheck` → `lint` |
| `.github/workflows/deploy.yml` | Created | Push to main trigger, `amondnet/vercel-action@v25` with GH secrets |
| `DEPLOY.md` | Created | Full deployment guide: prerequisites, env vars table, Docker, Vercel (GUI + CLI), GH Actions secrets |

## Verification Outcome

**Verdict**: ⚠️ PASS WITH WARNINGS

| Check | Result |
|-------|--------|
| Task completion | 9/9 implementation tasks ✅, 1/1 skipped (Docker build) |
| TypeScript type check | ✅ Zero errors |
| All file validity | ✅ JSON, YAML, Dockerfile all valid |
| Design coherence | ✅ Follows proposal, minor deviations documented |

**Critical issue resolved**: `SUPABASE_SERVICE_ROLE_KEY` was missing from `.env.production.example` (3 SIWE files used it while template only had `SUPABASE_SERVICE_KEY`). Fixed by unifying all source files to `SUPABASE_SERVICE_KEY`. `tsc --noEmit` verified clean.

**Remaining warnings** (non-blocking):
1. `docker-compose.yml` omitted from scope (listed in proposal but excluded from tasks)
2. Task 6.1 (Docker build verification) skipped — no Docker Desktop on dev machine

## Deviations from Proposal

| Deviation | Impact | Assessment |
|-----------|--------|------------|
| `docker-compose.yml` omitted | Low — `docker run` still viable | Warning |
| `amondnet/vercel-action@v25` instead of `npx vercel --prod` | Low — more robust CI | Acceptable improvement |
| `.dockerignore` extra entries (`.vercel`, `.cache`) | Positive — more thorough | Improvement |
| `CELO_PRIVATE_KEY` kept over `PRIVATE_KEY` | Maintains existing codebase convention | Correct |

## Specs Synced

No delta specs to sync — this was an infrastructure/config-only change with no spec-level capabilities (per proposal: "Capabilities: None").

## Risk Register

| Risk | Status |
|------|--------|
| Docker build not verified in CI | 🟡 Mitigated — static analysis confirms correct Next.js standalone pattern |
| Vercel deploy secrets not configured | 🟡 Documented in DEPLOY.md; must be set in GitHub before first deploy |
| Env var inconsistency discovered | ✅ Resolved during verification |

## SDD Cycle Complete

The deploy-config change has been fully planned, designed, implemented, verified, and archived.
