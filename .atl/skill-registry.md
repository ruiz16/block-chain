# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When writing Go tests, using teatest, or adding test coverage | go-testing | `~/.claude/skills/go-testing/SKILL.md` |
| When user says "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day | `~/.claude/skills/judgment-day/SKILL.md` |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | `~/.claude/skills/issue-creation/SKILL.md` |
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | `~/.claude/skills/branch-pr/SKILL.md` |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | `~/.claude/skills/skill-creator/SKILL.md` |
| Designing UI, choosing styles/colors/typography, reviewing UX, building design systems | ui-ux-pro-max | `~/.claude/skills/ui-ux-pro-max/.claude/skills/ui-ux-pro-max/SKILL.md` |
| Building UIs with shadcn/ui + Tailwind, implementing dark mode, creating responsive layouts | ckm:ui-styling | `~/.claude/skills/ui-ux-pro-max/.claude/skills/ui-styling/SKILL.md` |
| Creating HTML presentations with Chart.js, data-driven slides, pitch decks | ckm:slides | `~/.claude/skills/ui-ux-pro-max/.claude/skills/slides/SKILL.md` |
| Brand identity, logo/CIP generation, banners, social photos, icons | ckm:design | `~/.claude/skills/ui-ux-pro-max/.claude/skills/design/SKILL.md` |
| Design tokens (primitive→semantic→component), CSS variables, component specs | ckm:design-system | `~/.claude/skills/ui-ux-pro-max/.claude/skills/design-system/SKILL.md` |
| Brand voice, visual identity, messaging frameworks, brand compliance | ckm:brand | `~/.claude/skills/ui-ux-pro-max/.claude/skills/brand/SKILL.md` |
| Designing banners for social media, ads, website heroes, print | ckm:banner-design | `~/.claude/skills/ui-ux-pro-max/.claude/skills/banner-design/SKILL.md` |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### go-testing
- Use table-driven tests with `[]struct{name, input, expected, wantErr}` pattern for multiple test cases
- Test Bubbletea models directly: create model, call `model.Update(msg)`, assert state transitions
- For TUI integration tests, use `teatest.NewTestModel(t, m)` and send key messages via `tm.Send()`
- Use golden file testing for rendered output: write to `testdata/`, compare with `go test -update`
- Run tests with `go test ./...` — no special flags needed for table-driven or unit tests
- Run golden file tests with `go test -update ./...` to update snapshots

### judgment-day
- Launch TWO blind judge sub-agents in parallel via `delegate` — NEVER sequential, NEVER let them know about each other
- Before launching, resolve skill registry: search engram → `.atl/skill-registry.md` → skip if absent (warn user)
- Build `## Project Standards (auto-resolved)` block from matching compact rules and inject into BOTH judges AND fix agent
- Orchestrator synthesizes verdicts: Confirmed (both found) → fix immediately; Suspect (one found) → triage; Contradiction → flag for manual decision
- WARNING classification: real (causes bug in normal use) vs theoretical (requires contrived scenario) — theoretical = INFO, not fixed, not re-judged
- After fixing, re-judge with fresh judges; max 2 iterations before escalation
- After Round 1, only re-judge if confirmed CRITICALs exist; real WARNINGs fix inline without re-judge
- Do NOT do the review yourself as orchestrator — coordination only

### issue-creation
- Blank issues are disabled — MUST use a template (bug report or feature request)
- Every issue gets `status:needs-review` automatically on creation
- A maintainer MUST add `status:approved` before any PR can be opened
- Search existing issues for duplicates before creating a new one
- Fill in ALL required fields in the template (pre-flight checks, description, steps to reproduce, etc.)
- Questions go to Discussions, not issues

### branch-pr
- Every PR MUST link an approved issue with `status:approved` label — no exceptions
- Every PR MUST have exactly one `type:*` label (bug, feature, docs, refactor, chore, breaking-change)
- Branch names MUST match regex: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- PR body must include: linked issue (`Closes #N`), PR type checkbox, summary (1-3 bullets), changes table, test plan
- Automated checks must pass before merge is possible
- Run shellcheck on modified scripts before opening PR

### skill-creator
- SKILL.md frontmatter MUST include: name, description (with Trigger:), license (Apache-2.0), metadata.author (gentleman-programming), metadata.version
- Start with the most critical patterns — tables for decision trees, minimal code examples
- DO include Commands section with copy-paste commands
- DON'T add Keywords section, duplicate existing docs, include lengthy explanations, use web URLs in references
- Skill directory structure: `{name}/SKILL.md` + optional `assets/` (templates, schemas) + optional `references/` (local docs)
- After creation, register in AGENTS.md
- `references/` MUST point to LOCAL files, not web URLs

### ui-ux-pro-max
- Priority 1-10 rule categories: Accessibility (CRITICAL, 4.5:1 contrast) → Touch (CRITICAL, 44×44pt) → Performance (HIGH) → Style → Layout → Typography → Animation → Forms → Navigation → Charts
- Never sacrifice accessibility for aesthetics — visible focus rings, alt text, semantic HTML, keyboard nav
- Mobile-first responsive: base 16px, line-height 1.5, min touch target 44×44pt, 8px spacing between targets
- Use semantic color tokens, NOT raw hex; prefer SVG icons over emoji
- Animations: 150-300ms, meaningful (convey state change), respect `prefers-reduced-motion`
- Forms: visible labels (not placeholder-only), inline errors, progressive disclosure
- No horizontal scroll, no fixed px container widths, no disable zoom
- Always declare image width/height or aspect-ratio to prevent CLS

### ckm:ui-styling
- Use shadcn/ui components via CLI: `npx shadcn@latest add <component>` — components live in `@/components/ui/`
- Tailwind utility-first: mobile-first breakpoints (sm/md/lg/xl/2xl), `@theme` for custom tokens
- Dark mode via next-themes + CSS variables — toggle class on `<html>`
- Accessibility: Radix UI handles ARIA, but verify focus management, keyboard nav, and screen reader output
- Responsive: container queries for component-level, media queries for page-level; never fixed widths
- Visual design (Canvas mode): minimal text, maximum visual impact, museum-quality compositions
- Token system: use CSS variables for theme, NOT hardcoded values — validate with `validate-tokens.cjs`

### ckm:slides
- HTML presentations with Chart.js for data viz, design tokens for brand compliance
- Use layout patterns for structure, copywriting formulas for content
- Responsive design: fit any screen, no horizontal scroll
- Slide search (BM25): `python scripts/search-slides.py "<query>" -d <domain>` (copy, chart, layout, strategy)
- Token validation: run `slide-token-validator.py` on slide HTML to ensure brand compliance

### ckm:design
- Route to sub-skills: brand → `ckm:brand`, tokens → `ckm:design-system`, UI code → `ckm:ui-styling`, banners → `ckm:banner-design`
- Logo design: search first (`search.py --design-brief`), generate with AI (`generate.py`), always white background, always ask about HTML preview
- CIP design: 50+ deliverables, search by deliverable/style/industry, generate mockups, render HTML presentation
- Scripts require Python 3 — fix directly if they fail
- For slides, load `references/slides-create.md` for full workflow

### ckm:design-system
- Three-layer token architecture: Primitive (raw values) → Semantic (purpose aliases) → Component (component-specific)
- CSS variable naming: `--color-blue-600` (primitive) → `--color-primary` (semantic) → `--button-bg` (component)
- Component spec table: Background, Text, Border, Shadow per state (Default, Hover, Active, Disabled)
- Generate tokens: `node scripts/generate-tokens.cjs --config tokens.json -o tokens.css`
- Validate usage: `node scripts/validate-tokens.cjs --dir src/` — catches hardcoded values
- Integration: Extract primitives from brand colors (ckm:brand) → component tokens → Tailwind config (ckm:ui-styling)

### ckm:brand
- Source of truth: `docs/brand-guidelines.md` → sync to `assets/design-tokens.json` and `assets/design-tokens.css`
- Brand sync workflow: edit guidelines → `sync-brand-to-tokens.cjs` → verify with `inject-brand-context.cjs --json`
- Validates assets (naming, size, format), extracts/compares colors against palette
- Voice framework, visual identity, messaging framework, consistency checklist available as references
- Inject brand context into prompts: `node scripts/inject-brand-context.cjs`

### ckm:banner-design
- Gather requirements first: purpose, platform/size, content, brand, style preference, quantity
- Activate `ui-ux-pro-max` for design intelligence, research Pinterest references for art direction
- Safe zone: critical content in central 70-80%, max 2 typefaces, single CTA, 4.5:1 contrast ratio
- Generate visuals: Standard (Flash) for backgrounds/patterns (2K), Pro for hero illustrations (4K)
- Aspect ratios: 1:1, 16:9, 9:16, 3:4, 4:3, 2:3, 3:2 — match platform spec
- Pro model prompt: descriptive (style, lighting, mood, composition), include "no text, no letters, no words"
- Export: serve HTML locally → screenshot with `screenshot.js` at exact platform dimensions

## Project Conventions

No project-level convention files found. This is a greenfield project.

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
