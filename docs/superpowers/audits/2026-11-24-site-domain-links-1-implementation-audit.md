# Site #91 (site address to automataframework.com), cycle 1 implementation audit

**b7fec08 FAIL: 3 red**

- Pull request: https://github.com/mcthaydt/AutomataFrameworkSite/pull/91, head `b7fec08` (base `2003d4d`).
- Brief: `/mnt/project-files/briefs/site-domain-links.md` (plan audit 2 PASS, commit `2bd4b92` on #89).
- Lane 3 (a CI workflow file and `CLAUDE.md`). Fresh reviewer; changes nothing but this file.
- Started 2026-11-24 15:44 UTC (from `date`).

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or incomplete integrations. Do your best work.

## What holds (checked on b7fec08)

| Brief step | Result | Evidence |
| --- | --- | --- |
| 1. `SITE_URL: https://automataframework.com`, feeds `pick` and `live`, `deploy` untouched | PASS | `site.yml:39`; `pick` runs `scripts/pick-game.ts`, which fetches `${env.SITE_URL}/version.json` (`pick-game.ts:33`); `live` passes `BASE_URL: ${{ env.SITE_URL }}` to both journey steps (`site.yml:199`, `:203`). The workflow diff is that one line. |
| 2. `index.html` `og:url`, `og:image` | PASS | both on `https://automataframework.com/`. |
| 3. `facts.journey.ts` `ADDRESS` | PASS | `'https://automataframework.com/'`. |
| 4. `CLAUDE.md` line 5, `README.md`, this-repo skill first bullet, `progress.md` live-site line | PASS (but see R2) | each names the new address; the skill edit is named in the PR body. |
| 5. `site.test.ts` renamed test counts the new address once and the old zero times | PASS | `site.match(/https:\/\/automataframework\.com\b/g)` length 1 and `not.toContain('automataframework.pages.dev')`; named under "Tests changed". On the old `site.yml` the first assertion finds 0, so it fails by itself. |
| 6. `wrangler.toml`, `tests/features/play/talk.test.ts` left alone | PASS | not in the diff. |
| Nothing outside the brief changed | PASS | `git diff --stat 2003d4d b7fec08`: exactly the 8 files above. |
| Live-state file gone before the audit | PASS | `b7fec08` deletes `docs/superpowers/live/claude-project-thread-vrfy1o.md`; `docs/superpowers/live/` is absent. |
| Commit identity | PASS | `commit-authors` check success on b7fec08. |

## Red findings

### R1: the required `pr-rules` check fails (rule mix), so CI cannot go green

- UNIT: the pull request as a whole (its file set).
- VERDICT: red.
- REQUIREMENT: brief acceptance criterion "CI green on the pull request"; CLAUDE.md, Verification ("a change does not quietly edit its own check"), as enforced by the `ruleMix` rule; `pr-rules` is required on `main`.
- REASON: the brief puts a CI workflow file and `CLAUDE.md` in the same pull request as product code (`index.html`) and tests (`facts.journey.ts`, `site.test.ts`); the rule hooks forbid that mix. Neither plan audit mentions it.
- EVIDENCE: run 45428746304, job `pr-rules`: `#91 at b7fec08, lane 3, 8 files, 3 open.` / `NO  rule mix: this branch changes .github/workflows/site.yml and index.html`, exit 1. `.claude/hooks/rules.mjs:966-971`: rules files (`CLAUDE.md`, `.github/workflows/**`, shared skills) "may travel with docs and the rest of .claude/, never with product code or tests".
- EXPECTED: every required check green on the head the merge names.
- FIX: split by the rule, in an order the coordinator settles (a process choice, not the owner's). The repo's own precedent is `6d3186c` (workflow test widened first) then `f6cd477` (the CI change). One sequence that keeps every check green on every merge:
  1. PR A (product and tests): `index.html`, `facts.journey.ts`, and `site.test.ts` accepting `SITE_URL` written exactly once as either address (the transitional form, named under "Tests changed").
  2. PR B (rules and docs only): `site.yml`, `CLAUDE.md`, `README.md`, the this-repo skill, `progress.md`.
  3. PR C (test only): `site.test.ts` tightened to the brief's final form (new address once, `automataframework.pages.dev` zero times).
  The brief is amended to record the split before the rebuild. Files: only those listed per pull request.

### R2: the this-repo skill still names `automataframework.pages.dev`, and the PR body widened the criterion to allow it

- UNIT: `.claude/skills/this-repo/SKILL.md` line 11; the PR #91 body, "Acceptance criteria".
- VERDICT: red.
- REQUIREMENT: brief acceptance criterion: "`grep -rn "automataframework.pages.dev"` outside `docs/superpowers/{audits,specs,plans,history.md}`, `wrangler.toml` and the unit test finds nothing"; CLAUDE.md, Limits ("never ... weaken an acceptance criterion to get past a problem").
- REASON: the skill bullet keeps the old address ("so `automataframework.pages.dev` serves the same files"), and the PR body's criterion adds "the `this-repo` note that the old address still serves" to the exceptions, which the brief does not allow.
- EVIDENCE: `grep -rn "automataframework.pages.dev" .` on b7fec08, outside the allowed paths, prints `.claude/skills/this-repo/SKILL.md:11` and `tests/workflows/site.test.ts:121`. The `site.test.ts` hit is the assertion brief step 5 itself asks for, so it is not counted against the change; the skill line is.
- EXPECTED: the grep finds only the brief's exceptions; the PR body states the brief's criterion as written.
- FIX: in `.claude/skills/this-repo/SKILL.md` drop the old address from the bullet (for example "at https://automataframework.com (the Owner, 2026-11-24; a Pages custom domain)"), and restore the brief's criterion text in the PR body. If the note is wanted, the brief's author amends the brief first, not the builder. Files: that skill file and the PR body.

### R3: the PR body does not end with "Requested by **McThayDT**", and carries a "Generated by Claude Code" line

- UNIT: the PR #91 body.
- VERDICT: red.
- REQUIREMENT: CLAUDE.md, Rules that never bend, Identity: no "Generated with Claude Code" line in pull request bodies; "Pull requests end with 'Requested by **McThayDT**': check the body's last line after every create or edit".
- REASON: a footer was added after the "Requested by" line.
- EVIDENCE: the body's last lines are `Requested by **McThayDT**`, `---`, `_Generated by [Claude Code](https://claude.ai/code)_`.
- EXPECTED: the last line is `Requested by **McThayDT**`, with no Generated line.
- FIX: edit each pull request body to remove the trailing `---` and Generated line, then read the last line back. Files: none in the repo.

## Not run here, and why

- `check`, `build` and `build-real` were still running when this verdict was written; the FAIL does not depend on them. The rebuilt pull requests are judged on their own heads.
- The brief's post-merge criterion (the first `main` run's `live` job passes against https://automataframework.com) can only be checked after a merge.

## Notes (not blocking, follow-ups)

- N1: the rule-mix conflict is a gap in the brief and both plan audits. Lesson candidate for `history.md`: TRIGGER a brief that changes `.github/workflows/**` or `CLAUDE.md` together with product code or tests; LOOK FOR one pull request across both; FAILURE it fails `pr-rules` and cannot merge.
