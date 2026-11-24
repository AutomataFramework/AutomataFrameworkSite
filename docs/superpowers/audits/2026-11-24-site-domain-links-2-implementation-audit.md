# Site #93 (site address, part B of 3: the workflow and the docs), cycle 2 implementation audit

**9d672bd PASS**

- Pull request: https://github.com/mcthaydt/AutomataFrameworkSite/pull/93, head `9d672bd` (base `0fd0c93`, the merge of part A, #91).
- Brief: `/mnt/project-files/briefs/site-domain-links.md` (plan audit 2 PASS, `2bd4b92` on #89), as split by cycle 1's R1
  (`2026-11-24-site-domain-links-1-implementation-audit.md`, FAIL on `b7fec08`): A product and tests, B rules and docs,
  C the test tightened.
- Lane 3 (a CI workflow file and `CLAUDE.md`). Fresh reviewer; changes nothing but this file.
- Audited 2026-11-24, finished 16:42 UTC (from `date`).

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or incomplete integrations. Do your best work.

## What holds (checked on 9d672bd)

| Check | Result | Evidence |
| --- | --- | --- |
| Only rule and docs files, so `pr-rules` passes | PASS | `git diff --stat 0fd0c93 9d672bd`: `.claude/skills/this-repo/SKILL.md`, `.github/workflows/site.yml`, `CLAUDE.md`, `README.md`, `docs/superpowers/progress.md` (5 files, +7 −6). No product code or test. `pr-rules` success (check run and commit status). |
| Brief 1: `SITE_URL: https://automataframework.com`, feeds `pick` and `live`, `deploy` untouched | PASS | `site.yml:39` is the workflow's one changed line. `pick` runs `scripts/pick-game.ts`, which fetches `${env.SITE_URL}/version.json` (`pick-game.ts:33`); its log on this head prints `SITE_URL: https://automataframework.com` and passes. `live` passes `BASE_URL: ${{ env.SITE_URL }}` (`site.yml:199`, `:203`). `deploy` does not read `SITE_URL`. |
| The decision `pick` makes is unchanged | PASS | `curl` of `/version.json` at both addresses at 16:3x UTC: same body (`site 8c7910c…`, `game a4898b7…`), `cache-control: public, max-age=0, must-revalidate`, `cf-cache-status: DYNAMIC` on the domain, so the domain shows a new deploy as soon as `pages.dev` does. `http://automataframework.com/` answers 301 to https. |
| Brief 4: `CLAUDE.md` line 5, `README.md`, this-repo skill first bullet, `progress.md` live-site line | PASS | each names https://automataframework.com; the skill no longer names `pages.dev` (cycle 1 R2 closed); the skill edit is named in the PR body. |
| Brief criterion: `automataframework.pages.dev` nowhere outside the allowed paths | PASS | `grep -rn "pages\.dev"` outside `docs/superpowers/{audits,specs,plans,history.md}` finds only `wrangler.toml:1` (left alone, brief 6), `tests/features/play/talk.test.ts:4` (the unit test's made-up origin, brief 6), and `tests/workflows/site.test.ts:75`, `:121` (part A's transition lines, which part C removes; listed as exceptions in the PR body). |
| Tests still check the address | PASS | `site.test.ts` "the address is written once…" accepts either address written once: `site.yml` has `https://automataframework.com` exactly once. "the pages' address in index.html is the workflow's SITE_URL" now compares `index.html` with the new value directly. `check` success. |
| CI green | PASS | all 29 check runs success or skipped (the docs-only matrix), including `gate`, `pick`, `build-real`, `journeys-real` and `journeys` on all engines, `commit-authors`, `pr-rules`; combined status success. |
| Live-state file gone before the audit | PASS | `9d672bd` "Live state: hand the branch to its audit"; `docs/superpowers/live/` absent. |
| PR body | PASS | starts with the attribution lines, ends with `Requested by **McThayDT**`, no Generated line (cycle 1 R3 closed); lane, rollback, criteria and "Tests changed: None" stated. |

## Red findings

None.

## Not run here, and why

- The brief's post-merge criterion (the first `main` run's `pick` and `live` pass against https://automataframework.com) can only be checked after the merge; the merging session watches it. Note: `main`'s `site` run for `0fd0c93` was still pending behind the `8c7910c` run at 16:2x UTC, so the live site still served `8c7910c`.
- Part C (`site.test.ts` names only the domain) is not part of this pull request.

## Notes (not blocking)

- N1: `docs/superpowers/progress.md` keeps "Last updated: 2026-11-20 14:56 UTC" after this edit; the coordinator refreshes it at its next update.
- N2: the comment in `wrangler.toml:1` still says `(automataframework.pages.dev)`. It is true (the project still serves there) and the brief leaves the file alone; changing it would be lane 3 on its own.
