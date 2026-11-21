# Site #74 (deploy jobs in the image, drafts run every Node test): plan audit, cycle 1 (lane 3)

Audited 2026-11-21 (UTC, from `date`) by the CI speed-ups auditor, who wrote none of it. Commit examined: `f6cd477`.
Fit with: Site #73 `6d3186c` (lane 1, the tests; merges first).

## Verified

- **In scope of the owner's approval** (decision card 2026-11-21 14:39 UTC, CI speed-ups in all four repos). #68 named
  these as follow-ups, and the CLAUDE.md "CI speed" bullet the owner asked for is not true in Site without them.
  The draft Node-suite change in Site goes a step past the card's text, which named Editors and Examples. It is the same
  change for the same reason, and it makes the bullet true, so I read it as covered. The coordinator can say otherwise.
- **The pin:** the same image and digest as #68, checked live against mcr in cycle 1. The lockfile has `@playwright/test`
  1.63.0.
- **No check gets weaker:** #73 adds `build-real` and `live` to the strict image test in `ci.test.ts` (lockfile's tag, digest,
  `--user 1001`, version step, no install line when the job runs in a container). Its `site.test.ts` install assertion
  applies only outside the image. Merged in that order, `main` never checks less.
- **The deploy job is untouched:** `deploy` still runs on the runner, with the token. `live` checks after the deploy, so a
  `live` failure in the image makes `main` red but cannot stop or corrupt a deploy that already happened.
- **Before numbers reproduce.** I re-measured the last 150 `site` runs, 2026-11-14 to 16:32 UTC: `build-real` install p50
  18 s, p95 37 s, max 369 s (n 130), the same as the body. `live` gives p50 18 s, p95 77 s, max 226 s (n 50), against the
  body's p95 112 s (n 49). The window moved by one run. The order matches.
- **The `check` change** is the same as Editors/Examples: `ONLY` is `--bail=1` on a draft and empty on a full run. Nothing
  else in `check` read `origin/main`, so dropping `fetch-depth: 0` is safe.

## Notes

- N1: `live` has no comment explaining the container, unlike `build-real`. Optional.
- N2: The #73 and #74 bodies lack the two attribution lines the earlier CI PRs carried. They are not a repo rule, so
  this is a note only.
- N3: Plan for `live`'s proof, as the body says. The merging session watches the first `site` run on `main` and owns a
  revert if `live` fails because of the image.

## Verdict

The plan PASSes. No red.
