# Site #96, visit-counting notice: implementation audit, cycle 2

**07fb0df FAIL: 1 red**

- Pull request: https://github.com/mcthaydt/AutomataFrameworkSite/pull/96 (draft), branch `claude/project-thread-aciq3f`, head `07fb0df`. Cycle 1 (`ec9fe42`, FAIL: 2 red) is `2026-11-24-site-visit-counting-consent-1-implementation-audit.md`.
- Commits since cycle 1: `fac4c4b` (Yes and No share one style; the copy now ends "Unless you press Yes, we count nothing."), then `16db2e1`, `c442f2d`, `07fb0df` (journeys only: come back on a new page, the stand-in report without keepalive, a report counted on `requestfinished` and answered 200).
- Lane 2. Fresh review by the cycle 1 reviewer; no code changed by the reviewer.
- The coordinator's question for R1, since the token waits on the owner (who may ship with no counter): with `SITE_TOKEN_PENDING`, does pressing Yes load nothing from outside the site and fail safely? If so, R1 becomes a note.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or incomplete integrations. Do your best work.

## What ran (on 07fb0df, this container, Node 22.23.5)

- `pnpm lint` (the same 1 warning outside this diff), `pnpm knip`, `pnpm typecheck`: clean. `pnpm test:node`: 326 passed. `pnpm build`: ok.
- `playwright test --project chromium` on the `count`, `hosting`, `arrive` and `home` journeys: 94 passed. WebKit and Firefox are not installed here; CI runs them.
- A probe with Cloudflare **not** stubbed (Chromium, the built site under `wrangler pages dev` at 127.0.0.1:8799, 1440x900), pressing Yes, waiting 5 s, then leaving the page.

## Cycle 1 findings

- **R2 (Yes dressed as the main action): fixed.** `index.html` gives both buttons `btn second small`; `count.journey.ts` now checks, at all five sizes, that Yes and No share colour, background, border, weight, width and height. The diff is shown above.
- **R1 (placeholder token): still red, on the coordinator's own test.** See finding 1.

## Findings

### 1. red: with the placeholder token, Yes still reaches Cloudflare

- UNIT: `src/features/count/count.ts:9` and `addCounter` (`count.ts:13-20`)
- REQUIREMENT: cycle 1 R1; the coordinator's rule for this cycle, "pressing Yes loads nothing outside the site and fails safely".
- REASON: nothing checks the token before adding the counter, so Yes loads Cloudflare's real script, which then sends a report under a token that belongs to no site. The visitor's data goes to Cloudflare and nothing is counted. The page also logs errors.
- EVIDENCE: before Yes, no request leaves the site. After Yes the probe saw `GET https://static.cloudflareinsights.com/beacon.min.js` → 200 (Cloudflare's real script), then `POST https://cloudflareinsights.com/cdn-cgi/rum`. From 127.0.0.1 the POST's CORS preflight failed (`net::ERR_FAILED`, and the console shows "Access to XMLHttpRequest at 'https://cloudflareinsights.com/cdn-cgi/rum' ... blocked by CORS policy"), but the preflight still reached Cloudflare. From automataframework.com the report would be the one Cloudflare's script is made to send. There were no cookies afterwards. Nothing was collected without consent: the visitor did press Yes. But the result is neither "nothing outside the site" nor a quiet failure.
- EXPECTED: while there is no real token, Yes adds nothing (no script, no request, no console error). Better, the question and the footer switch stay hidden, since asking "May we count your visit?" when nothing can count misleads. Once the real token lands, all of this turns back on.
- FIX: in `src/features/count/count.ts`, treat the placeholder as "no counter". For example, `startCounting` returns before showing the question or the footer switch when the token is `SITE_TOKEN_PENDING`, and `addCounter` never runs with it. Add a journey or unit check that fails if that is undone. While the token is pending, the `count.journey.ts` tests that expect the notice will need the build to carry a test token, or the check placed in a function the journeys can reach; the builder picks. Files: `src/features/count/count.ts`, `tests/journeys/count.journey.ts`, and a new test file if one is used. Alternatively, put in the real token (cycle 1's fix). Either clears this red.

## Notes (not blocking)

- N1 (cycle 1, still so): at 1440x900 the notice pushes the game's sheet out of the first screen. This is for the owner's look at the screens.
- N2 (cycle 1): the copy now says "Unless you press Yes, we count nothing." That is true of the site itself, and closer than before. Cloudflare as the host still sees every request; that is the owner's call.
- N3 (cycle 1): Yes, then Stop, then Yes on one page leaves the counter blocked until the next page. It is safe.
- N4 (cycle 1, now due): `docs/superpowers/live/claude-project-thread-aciq3f.md` is still on the branch at `07fb0df`, and it still says Cloudflare's injection is on, which the live site shows is not true. CLAUDE.md wants that file deleted in the last commit before the branch goes to audit, so the commit the audit names is the one that merges. Delete it in the fix commit.
- N5 (cycle 1): there is still no page that says what the counter records.
- Journey-only commits (`16db2e1`, `c442f2d`, `07fb0df`): they change how the checks watch (the whole browser context rather than one page, a new page in place of a reload), not what they demand. The away-list now covers every page of the visit, which is stricter. Nothing was weakened.
