# CI speed-ups: implementation audit, cycle 2 (lane 3), Site #68

Re-check by the cycle 1 auditor, 2026-11-21 16:05 UTC (from `date`). Commit examined: Site #68 `1b2dd7f` (merge of
`main`, which brings #69 as merged, into `01c3a76`). Other repos are re-checked as their new heads arrive.

## Cycle 1 reds, each re-checked

1. After numbers: PASS. The body has measured After from full run 44921725243 on `1b2dd7f` (shards setup p50 50 s, max
   51 s, 26 s of it the image; build 49 s; run 6.7 min) and says plainly that the median does not move and the tail is
   what goes away, and that one run is not a p95. Consistent with my cycle 1 measurement (p50 47 s, max 52 s).
2. Live-state file: PASS. The pull request's diff holds only `ci.yml`, `journeys.yml` and the two cycle 1 audit files.
3. Green: PASS. On `1b2dd7f` every check run is `success` or a by-design skip (docs-only, `live`, `deploy`): `check`,
   `gate`, `commit-authors`, all journey shards and `build-real`/`journeys-real` in all three engines. First run on this
   head, no re-runs.
4. Plan red (the check gap): PASS. `tests/workflows/ci.test.ts` on `main` (from #69, `8d939ad`) now requires, for `build`
   and the journeys `shards` when they run in a container, the image tagged with the lockfile's `@playwright/test`,
   pinned by `@sha256:[0-9a-f]{64}`, `--user 1001`, the version step, and no `playwright install|install-deps` line. So
   `main` never checks less than before.

## Also checked

- Commits: all five authored and committed by McThayDT; the body ends "Requested by **McThayDT**".
- The merge of `main` was clean and touched no file the cycle 1 audit read except `tests/workflows/ci.test.ts`, read above.

## Note (unchanged from cycle 1)

`site.yml`'s deploy calls `journeys.yml`; the merging session watches the first `site` run on `main`. `build-real` and
`live` still install Chromium, out of scope here and named in the body.

## Verdict

`1b2dd7f` PASS. The owner's approval (2026-11-21 14:39 UTC, "merge after audits") covers the merge.
