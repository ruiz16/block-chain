# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When writing Go tests, using teatest, or adding test coverage | go-testing | `~/.config/opencode/skills/go-testing/SKILL.md` |
| When user says "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day | `~/.config/opencode/skills/judgment-day/SKILL.md` |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | `~/.config/opencode/skills/issue-creation/SKILL.md` |
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | `~/.config/opencode/skills/branch-pr/SKILL.md` |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | `~/.config/opencode/skills/skill-creator/SKILL.md` |
| When user asks any question about a codebase, project content, architecture, or file relationships — especially if graphify-out/ exists | graphify | `~/.config/opencode/skills/graphify/SKILL.md` |

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

### graphify
- Run `/graphify` on the current directory or specified path to generate a knowledge graph
- Output: interactive HTML, GraphRAG-ready JSON, and GRAPH_REPORT.md
- Modes: default (balanced), deep (thorough extraction), update (incremental), cluster-only (rerun clustering), no-viz (skip visualization)
- Use BFS/DFS query tools to explore the graph after generation
- Already-generated graphs live in `graphify-out/`

## Project Conventions

No project-level convention files found (no AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, copilot-instructions.md).
