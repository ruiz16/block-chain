# Verification Report

**Change**: deploy-config
**Version**: 1.0
**Mode**: Standard (strict_tdd: false)

---

## 1. Task Completion

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1.1 | Create `.env.production.example` | ✅ Done | File exists, 34 lines, covers all var groups |
| 1.2 | Add `typecheck` script to `package.json` | ✅ Done | `"typecheck": "tsc --noEmit"` present in scripts |
| 2.1 | Set `output: "standalone"` in `next.config.ts` | ✅ Done | `output: 'standalone'` set |
| 2.2 | Create Dockerfile (multi-stage) | ✅ Done | 3-stage `node:20-alpine`, healthcheck, non-root user |
| 2.3 | Create `.dockerignore` | ✅ Done | 11 entries, excludes `node_modules`, `.next`, `.git`, `.env*`, `.vercel` |
| 3.1 | Create `vercel.json` | ✅ Done | 12 lines, `framework: "nextjs"`, App Router rewrites |
| 4.1 | Create CI workflow | ✅ Done | `.github/workflows/ci.yml`, PR→main, typecheck + lint |
| 4.2 | Create Deploy workflow | ✅ Done | `.github/workflows/deploy.yml`, push→main, `amondnet/vercel-action@v25` |
| 5.1 | Create `DEPLOY.md` | ✅ Done | 156 lines, covers Docker, Vercel, env ref, CI/CD, post-deploy |
| 6.1 | Verify: `docker build` | ❌ Skipped | Docker Desktop not available on dev machine |

**Tasks total**: 10
**Tasks complete**: 9 (all implementation)
**Tasks incomplete**: 1 (6.1 — Docker build verification, skipped)

---

## 2. Correctness (Static Analysis)

### File Validity

| File | Type | Status | Notes |
|------|------|--------|-------|
| `.env.production.example` | Plain text | ✅ Valid | Well-formed |
| `Dockerfile` | Dockerfile | ✅ Valid | Correct syntax |
| `.dockerignore` | Plain text | ✅ Valid | Correct syntax |
| `vercel.json` | JSON | ✅ Valid | Parsed successfully |
| `ci.yml` | YAML | ✅ Valid | Correct structure |
| `deploy.yml` | YAML | ✅ Valid | Correct structure |
| `package.json` | JSON | ✅ Valid | Parsed successfully |
| `next.config.ts` | TypeScript | ✅ Valid | Compiles with `tsc --noEmit` |

### Dockerfile Next.js Standalone Paths

The Dockerfile copies:
- `COPY --from=builder /app/.next/standalone ./` → puts standalone output at `/app/` in runner
- `COPY --from=builder /app/.next/static ./.next/static` → puts static assets at `/app/.next/static`
- `CMD ["node", "server.js"]` → runs the Next.js standalone server

**Verdict**: ✅ Correct — standard Next.js standalone Docker pattern. The standalone output places `server.js` at the root, and static files are copied to the expected `.next/static` path relative to the working directory.

### Env Template vs Actual Code — CRITICAL FINDING

The `.env.production.example` lists `SUPABASE_SERVICE_KEY`, but the source code uses **two different names** for the Supabase service key:

| Env Var | Used In | In `.env.production.example`? |
|---------|---------|-------------------------------|
| `SUPABASE_SERVICE_KEY` | `src/lib/supabase/client.ts:27` | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/app/api/auth/siwe/route.ts:39` | ❌ **MISSING** |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/app/api/auth/nonce/route.ts:29` | ❌ **MISSING** |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/siwe/nonce.ts:21` | ❌ **MISSING** |

**Impact**: If someone copies `.env.production.example` and sets `SUPABASE_SERVICE_KEY`, the SIWE auth endpoints (`/api/auth/siwe`, `/api/auth/nonce`) will fail at runtime because `process.env.SUPABASE_SERVICE_ROLE_KEY` will be `undefined`.

This is a codebase **inconsistency** — the template only has one name, but different parts of the code expect different names. The fix should address either:
- Rename all usages to one consistent name (preferred), OR
- List both vars in the template with documentation explaining the difference

**All other env vars in `.env.production.example` match what the codebase uses:**

| Env Var | In Code? | In Template? |
|---------|----------|-------------|
| `NODE_ENV` | Implicit (Next.js sets it) | ✅ |
| `NEXT_PUBLIC_APP_URL` | Not found in `src/` grep | ✅ (may be used indirectly) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ 10 refs across 7 files | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ 6 refs across 5 files | ✅ |
| `SUPABASE_SERVICE_KEY` | ✅ 1 ref (`client.ts`) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ 3 refs across 3 files | ❌ **MISSING** |
| `CELO_RPC_URL` | ✅ 1 ref (`celo.ts`) | ✅ |
| `CELO_PRIVATE_KEY` | ✅ 1 ref (`client.ts`) | ✅ |
| `CELO_CUSD_CONTRACT` | ✅ 1 ref (`celo.ts`) | ✅ |
| `NEXT_PUBLIC_CELOSCAN_BASE_URL` | ✅ 1 ref (`celo.ts`) | ✅ |
| `NEXT_PUBLIC_SITE_URL` | Not directly found (used by Supabase Auth) | ✅ |

### CI Workflow Script Reference

CI workflow (`ci.yml`) runs `npm run typecheck` → maps to `"typecheck": "tsc --noEmit"` in `package.json`. **Confirmed**: script exists and passes (verified with real execution below).

---

## 3. Coherence (Design Match)

| Decision (Proposal) | Followed? | Notes |
|---------------------|-----------|-------|
| Docker: `node:20-alpine`, 3 stages, standalone | ✅ Yes | Full match |
| `.dockerignore` excludes `.env*` | ✅ Yes | Also adds `.vercel`, `.cache` (improvement) |
| Vercel: framework nextjs, passthrough rewrites | ✅ Yes | Exact match |
| Env template extends `.env.local.example` | ✅ Yes | Adds `NODE_ENV=production`, groups by sections |
| CI: PR→main, `tsc --noEmit` + `next lint` | ✅ Yes | Uses `setup-node@v4` with cache |
| CD: Push→main, Vercel deploy | ✅ Yes | Uses `amondnet/vercel-action@v25` instead of raw `npx vercel --prod` (acceptable deviation) |
| DEPLOY.md: 3 sections | ✅ Yes | Vercel, Docker, Env reference — plus CI/CD and post-deploy |
| **Scope: docker-compose.yml** | ⚠️ **Missing** | Listed in proposal's "In" scope but was deliberately omitted in task list. DEPLOY.md mentions it as a note but no file exists. |

### Deviations from Proposal

| Deviation | Impact | Assessment |
|-----------|--------|------------|
| `docker-compose.yml` omitted | Low — Docker deploy still possible with `docker run` directly | ⚠️ WARNING: Proposal scope included it, but tasks deliberately excluded it |
| `amondnet/vercel-action@v25` instead of `npx vercel --prod` | Low — more robust CI integration | ✅ Acceptable improvement |
| `.dockerignore` has extra entries (`.vercel`, `.cache`) | Positive — more thorough | ✅ Improvement |

---

## 4. Real Execution: Build & Type Check

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ **PASSED** — zero errors, zero warnings |

No tests exist in the project (greenfield per `openspec/config.yaml`), so test execution is skipped.

---

## 5. Issues Found

### CRITICAL (must fix before archive) — RESUELTO ✓

1. **Env var name mismatch: `SUPABASE_SERVICE_ROLE_KEY` missing from template**
   - **What**: `.env.production.example` listed `SUPABASE_SERVICE_KEY`, but 3 SIWE files used `SUPABASE_SERVICE_ROLE_KEY`. Two different names for the same thing.
   - **Impact**: SIWE auth endpoints would crash in production if only `SUPABASE_SERVICE_KEY` was set.
   - **Fix applied**: Unified all references to `SUPABASE_SERVICE_KEY` across the codebase. Changed 3 files:
     - `src/app/api/auth/siwe/route.ts` — `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY` (2 occurrences)
     - `src/app/api/auth/nonce/route.ts` — `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY` (1 occurrence)
     - `src/lib/siwe/nonce.ts` — `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY` (2 occurrences)
   - **Verified**: `tsc --noEmit` passes with zero errors after fix. Template `.env.production.example` needed no changes (already had `SUPABASE_SERVICE_KEY`).

### WARNING (should fix)

1. **`docker-compose.yml` omitted from scope**
   - Listed in proposal's "In" scope but not created
   - DEPLOY.md section 2.3 references Docker Compose as "recommended" but doesn't provide the file
   - Users following DEPLOY.md will wonder why `docker-compose.yml` is missing

2. **Task 6.1 (Docker build verification) skipped**
   - No Docker Desktop available to verify `docker build` succeeds
   - Dockerfile correctness is based on static analysis only
   - Should be verified before production use

### SUGGESTION (nice to have)

1. **`next.config.ts` is minimal** — only has `output: 'standalone'`. Consider adding image domains, headers, or redirects if needed later.

2. **`DEPLOY.md` references `docker-compose.yml` as recommended** — consider either creating the file or removing the recommendation to avoid confusion.

3. **The `typecheck` script is in `package.json` but not running in `npm run build`** — consider adding it to the build pipeline for earlier error detection.

---

## 6. Verdict

### ⚠️ **PASS WITH WARNINGS**

The implementation is structurally complete — all 9 implementation tasks are done, typecheck passes, all files are valid, and the Dockerfile follows correct Next.js standalone patterns. 

**The CRITICAL issue (env var name mismatch) has been RESOLVED** — all 3 SIWE files were unified to `SUPABASE_SERVICE_KEY` to match the rest of the codebase. `tsc --noEmit` verified with zero errors.
