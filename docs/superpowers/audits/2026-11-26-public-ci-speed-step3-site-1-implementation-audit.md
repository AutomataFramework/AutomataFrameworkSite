# Implementation audit: public CI speed, step 3, Site (cycle 1)

Examined: AutomataFrameworkSite draft PR #119 at 5a855b6 (7e0e864, then 5a855b6), against step 3 and criterion 4 of Framework's `docs/superpowers/plans/2026-11-26-public-ci-speed.md`, and against the findings on Framework #334 (cycles 1 to 3). Runs on 5a855b6: `ci` [45754470624](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45754470624) and `site` [45754470702](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45754470702), both green.

Verdict: **5a855b6 PASS** (0 red).

## What was checked

- **Framework's fixes, carried over.**
  - **`actions: read`.** The `pieces` job in `journeys.yml` already declares `actions: read` and `contents: read`, to download the site. Both callers grant it: `ci.yml` `journeys` and `site.yml` `journeys-real`.
  - **Same-repo lookup.** Site picks the run in TypeScript (`pickRun`), not jq. It keeps only unexpired artifacts whose `head_repository_id === repository_id`, then the newest on `main`, else on the PR branch. Tests cover a fork branch named `main` and expired artifacts.
  - **Bad times.** `fill` ignores any time that is not finite and 0 or more, with a test.
- **The sh fix (5a855b6).** The piece step now declares `shell: bash`. The container's `sh` has no lists or `<<<`, which `mapfile -t files <<<"$mine"` needs. The run on 5a855b6 used it and was green.
- **Empty pieces are caught on full runs.** `browser-fill.ts files` throws on an empty piece. In the piece step, that leaves `result=failed`, so the engine fails and the job exits 1. `gate`'s `check` also fails when a piece left a list but no report, or when a file in the report never started.

  The body cites `main`'s `--shard` playing nothing in piece 4 in every engine and still passing (run 45741278139). On a full run that can no longer pass. Drafts still use `--shard`, so it can still happen there; see the notes.
- **Coverage (criterion 4).** On 45754470624, `gate` printed `ok  chromium|webkit|firefox: 15 of 15 files played in exactly one piece` and recorded 15 files from 18 reports. Each engine's own `playwright test --list` is the list it is judged against.
- **One server per piece.** `wrangler pages dev dist --ip 127.0.0.1 --port 8788` is the same command Playwright's `webServer` ran. `BASE_URL` only turns off Playwright's own server. No test reads `BASE_URL`, so the journeys see the same site. The change is named in the body, and `ci.test.ts` asserts it.
- **The deploy path.** `site.yml` calls `journeys.yml` with the default `full: true`. On `main` it fills from `main`'s times, and an empty piece fails its engine, which blocks `deploy` as before.
- No retry, no wider timeout and no new skip. Drafts keep `max-failures` 1 and Chromium only.

## Notes (not blocking)

- **Drafts still use `--shard`,** so a draft piece can still play nothing and pass. Step 5's "not applicable" should close this.
- **Each piece looks up the times run for itself,** six API calls, where Framework and Examples look it up once in `plan`. If a `main` run uploads `test-times` while the pieces start, two pieces could fill from different times. That fails loudly, because the full-run check finds a file twice or nowhere, and it is rare. Picking once and passing the id down would remove it.
- **`site.yml` has no coverage check of its own.** It relies on the empty-piece refusal and on each piece passing. `ci`'s `gate` does the full check on the same code.
- **The after numbers are pending.** The first run filled by count, and the ready run fills from this branch's times. They belong in the body before the merge, which is the PR's criterion 6.
- **The lookup reads only the newest 100 `test-times` artifacts.** This note is carried from Framework.
