# Plan audit: move the site's own address to https://automataframework.com (cycle 2)

- Brief: `/mnt/project-files/briefs/site-domain-links.md` (project files, revised after cycle 1).
- Examined against: AutomataFrameworkSite `main` at 8d13bda, the live addresses on 2026-11-24 15:21 UTC, and
  cycle 1 (`2026-11-24-site-domain-links-1-plan-audit.md`, FAIL: R1).
- Lane: 3 (CI workflow and `CLAUDE.md`). An implementation audit follows the build.
- Reviewer: a fresh session that did not write the brief or cycle 1.

## Verdict

**8d13bda PASS**

R1 is fixed in the brief, all four notes are folded in, and a sweep of the repo finds no other file or test that
names the old address and is missed by the plan.

## Cycle 1 findings, checked

- **R1 (red): fixed.** Step 5 now changes `tests/workflows/site.test.ts` line 120's test ("the address is written
  once and matches the project name in wrangler.toml") to count `https://automataframework.com` once and `pages.dev`
  zero times in `site.yml`, renames it so it no longer says the address matches the project name, keeps the
  project-name checks, and names the edit under "Tests changed" in the pull request body. Evidence: on 8d13bda,
  `site.yml` names a host only at line 39 (`SITE_URL`); `deploy` uses `--project-name ${project}`, never a host. So
  after step 1 the new count is exactly 1 and the old count 0, and the test passes.
- **N1: folded in.** Step 1 says `SITE_URL` feeds `pick` (`scripts/pick-game.ts` line 33 reads
  `${SITE_URL}/version.json`) as well as `live` (`site.yml` lines 199 and 203, `BASE_URL: ${{ env.SITE_URL }}`).
- **N2: folded in.** Risk says roll back by reverting the whole merge.
- **N3: folded in.** Step 4 names the `this-repo` skill edit in the pull request body.
- **N4: folded in.** The criteria say the merging session watches the first `main` run in the foreground.

## Sweep for the old address (8d13bda)

`grep -rn "pages.dev"` over the repo, with each hit placed:

| Hit | In the plan |
| --- | --- |
| `.github/workflows/site.yml:39` `SITE_URL` | step 1 |
| `index.html:15-16` `og:url`, `og:image` | step 2 |
| `tests/journeys/facts.journey.ts:9` `ADDRESS` (checked at lines 65-66 against the page's `og:` tags) | step 3 |
| `CLAUDE.md:5` | step 4 |
| `README.md:18` hosting line | step 4 |
| `.claude/skills/this-repo/SKILL.md:10` ("until there is a domain") | step 4 |
| `docs/superpowers/progress.md:45` live-site line (the only hit in that file) | step 4 |
| `tests/workflows/site.test.ts:120` | step 5 |
| `wrangler.toml:1` comment (the Pages project's own address, still true) | step 6, excluded from the criterion |
| `tests/features/play/talk.test.ts:4` made-up origin | step 6, excluded from the criterion |
| `README.md:43,50,60`, `tests/journeys/hosting.journey.ts:3`, `tests/docs/readme.test.ts:12`, `playwright.config.ts:2,49`, `pnpm-workspace.yaml:3`, `.claude/skills/verify/SKILL.md:14,24,52` | `wrangler pages dev`, the local server command, not the host: no change |

Every hit is covered or rightly left alone, so the acceptance `grep` can pass as written.

Tests that tie the pieces together and keep passing once steps 1 to 3 and 5 land together:

- `site.test.ts:70` reads `SITE_URL` from `site.yml` and expects `og:url` = `${url}/` and `og:image` =
  `${url}/share.png` in `index.html`. Steps 1 and 2 give `https://automataframework.com` and
  `https://automataframework.com/`, so it holds.
- `facts.journey.ts:65-66` expects the page's `og:` tags to equal `ADDRESS`; step 3 moves `ADDRESS` with step 2.
- No test reads `CLAUDE.md`, `progress.md` or the `this-repo` skill for an address (`tests/docs/readme.test.ts` and
  `tests/workflows/{docs-only,compaction-hook}.test.ts` read those files for other things).

## Live addresses (2026-11-24 15:21 UTC, from this container)

- `https://automataframework.com/version.json`: 200 `application/json`, site 8d13bda, game f5cd7a3, the same as
  `https://automataframework.pages.dev/version.json`, with `cache-control: public, max-age=0, must-revalidate` and
  `cf-cache-status: DYNAMIC`. So `pick` decides the same at either address and the `live` wait does not read a
  stale build.

## Not checked

- The certificate's issuer and end date: this container's proxy re-signs TLS, as cycle 1 said.
- The build itself: this is a plan audit. The implementation audit checks the diff and CI.

## Notes (not blocking, outside this brief's repo)

- N5. Other repos still name the old address, which keeps working, so nothing breaks: AutomataFramework
  `docs/roadmap.md:257-258` ("Later: the domain, bought and pointed at the site ... Until then it stays at
  `automataframework.pages.dev`"), now out of date; AutomataFrameworkExamples `docs/superpowers/progress.md:47`;
  AutomataFrameworkEditors `docs/superpowers/handoff/2026-11-20-world-slice-handoff.md:21` (a dated handoff, history).
  Follow-up for the coordinator: the roadmap line, in its own lane 1 pull request, if wanted.
- N6. `https://www.automataframework.com` has no record (502 through this container's proxy). The owner did not ask
  for `www`; recorded only.
