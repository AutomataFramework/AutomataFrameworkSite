# Plan audit: move the site's own address to https://automataframework.com (cycle 1)

- Brief: `/mnt/project-files/briefs/site-domain-links.md` (project files, 2026-11-24).
- Examined against: AutomataFrameworkSite `main` at 8d13bda, and the live addresses on 2026-11-24 15:17 UTC.
- Lane: 3 (CI workflow and `CLAUDE.md`), so this plan audit, then an implementation audit after the build.

## Verdict

**8d13bda FAIL: 1 red**

The plan is right in shape and small, but as written its own CI goes red: a unit test pins the old address in
`site.yml`, and the brief neither changes it nor names it. One line added to the brief fixes it.

## Red

**R1. The workflow test still expects the old address once in `site.yml`.**

- UNIT: `tests/workflows/site.test.ts`, line 120.
- VERDICT: red.
- REQUIREMENT: the brief's own criterion "CI green on the pull request"; the `review` skill's rule that a change to an
  existing test is named in the pull request body.
- REASON: step 1 removes the only `automataframework.pages.dev` in `site.yml`, and this test counts exactly one.
- EVIDENCE: line 120 is `expect(site.match(/automataframework\.pages\.dev/g)).toHaveLength(1)`. Applying step 1 to
  `site.yml` with `sed` and counting with `grep -c 'automataframework\.pages\.dev'` gives 0, so `match` returns `null` and
  the test fails. Step 5's list of files to leave alone does not cover it, and the acceptance `grep` misses it (the
  escaped `\.` in the regex does not match the plain pattern).
- EXPECTED: the test keeps its point (the address is written once in the workflow) for the new address.
- FIX: add to the brief's change list: in `tests/workflows/site.test.ts`, line 120 counts
  `/automataframework\.com/g` once, and the test's name stops saying the address "matches the project name in
  wrangler.toml" (it no longer does; the project name checks below it stay). Name this test edit and why in the pull
  request body. Files: the brief, and in the build `tests/workflows/site.test.ts` only.

## Checked and fine

- `tests/workflows/site.test.ts` line 70 ("the pages' address in index.html is the workflow's SITE_URL") keeps
  passing once steps 1 and 2 land together; it is the check that ties them.
- `SITE_URL` is workflow-wide: besides `live`, `pick` reads `${SITE_URL}/version.json` (`scripts/pick-game.ts` line 33)
  on every run, the 10-minute schedule included. The new address serves the same `version.json` as the old one
  (site 8d13bda, game f5cd7a3), with `cache-control: public, max-age=0, must-revalidate` and `cf-cache-status: DYNAMIC`,
  so `pick` and the `live` wait do not read a stale build. The brief should say `pick` reads it too (see N1).
- `https://automataframework.com/share.png` answers 200 `image/png`; `http://` answers 301.
- `_headers` CSP is all `'self'`, and `talk.ts` uses the page's own `window.origin`, so the new host needs no code
  change. `talk.test.ts` uses a made-up origin, as step 5 says.
- No journey other than `facts.journey.ts` names an address; the others use `BASE_URL`.
- The acceptance `grep` matches the file list in steps 2 to 4 (plus `wrangler.toml` and the unit test, excluded).
- Rollback by reverting the one `SITE_URL` line is not enough on its own: with R1 fixed, the test and `index.html`
  must go back with it (line 70 ties them). Revert the whole merge instead (see N2).

## Not checked

- The certificate issuer and end date: this container's egress proxy re-signs TLS, so the chain seen here is the
  proxy's, not Cloudflare's. The brief's Let's Encrypt to 2027-02-17 is taken from the session that set it up.

## Notes (not blocking)

- N1. Step 1 says the `live` job uses `SITE_URL`; `pick` uses it too, to decide whether to deploy. Say so in the brief so
  the implementation audit checks both.
- N2. Rollback: "revert the merge commit", not "the one `SITE_URL` line", since `index.html`, the facts journey and
  the workflow test must agree.
- N3. The `this-repo` skill edit (step 4) is named in the pull request body, as the site's `CLAUDE.md` asks.
- N4. "On `main` after the merge, the `live` job passes" needs the merge's own `site` run to deploy (`pick` says
  deploy on a push to `main`); the implementer watches that run in the foreground, as `release` says.
