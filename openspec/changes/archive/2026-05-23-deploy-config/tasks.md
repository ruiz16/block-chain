# Tasks: deploy-config

## Phase 1: Environment

- [x] 1.1 Create `.env.production.example` — extend `.env.local.example` with `NODE_ENV=production`, group public vs secret vars under clear section headers
- [x] 1.2 Add `"typecheck": "tsc --noEmit"` script to `package.json`

## Phase 2: Docker

- [x] 2.1 Set `output: "standalone"` in `next.config.ts` for Docker multi-stage support
- [x] 2.2 Create `Dockerfile` — 3 stages (deps→builder→runner), `node:20-alpine`, port 3000, healthcheck
- [x] 2.3 Create `.dockerignore` — exclude `node_modules`, `.next`, `.git`, `.env*`, `.vercel`

## Phase 3: Vercel

- [x] 3.1 Create `vercel.json` — `framework: "nextjs"`, build/install commands, App Router rewrites

## Phase 4: CI/CD

- [x] 4.1 Create `.github/workflows/ci.yml` — trigger on PR to main, `typecheck` + `lint` on Node 20
- [x] 4.2 Create `.github/workflows/deploy.yml` — trigger on push to main, `npx vercel --prod` with GH secrets

## Phase 5: Documentation

- [x] 5.1 Create `DEPLOY.md` — Vercel deploy, Docker deploy, env var reference table

## Phase 6: Verify

- [ ] 6.1 Run `docker build -t block-chain .` and confirm clean build ⚠️ SKIPPED — Docker not available on this dev machine; requires Docker Desktop
