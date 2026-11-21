# Site #74: implementation audit, cycle 2 (lane 3)

Re-check 2026-11-21 (UTC, from `date`). Commit examined: `87a8bfc`. It merges `main`, which brings #73 as merged, into
`f6cd477` and adds a comment on `live`.

1. After: PASS. The body gives `build-real` from run 44926424846: image start 20 s and version check 1 s, against the old
   install's p50 of 18 s. I checked the job steps: `Initialize containers` ran 16:50:59 to 16:51:19 and the version step
   took 1 s. The body says "median same, tail gone" and marks `live` pending until the first `site` run on `main`.
2. Green: PASS. `ci` 44926424847, `site` 44926424846 and `commit-authors` 44926424879 all passed on attempt 1. That
   covers `build-real` and `journeys-real` in all three engines. A second `commit-authors` run (44927501724), started by
   the body edit, was still queued. It has to pass before the merge.
3. Since `f6cd477`, only `site.yml` (a comment line) and the two `tests/workflows` files from #73 changed. `ci.test.ts` on
   this head checks `build-real` and `live` against the pinned image. All commits are McThayDT's, and the body ends
   "Requested by **McThayDT**".

Carry-over: the session that merges watches `live` on the first `site` run on `main`, adds its After numbers, and owns a
revert if the image breaks it.

Verdict: `87a8bfc` PASS.
