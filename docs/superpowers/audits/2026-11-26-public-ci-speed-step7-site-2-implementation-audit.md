# Implementation audit: public CI speed, step 7 (merge queue), Site (cycle 2)

Verdict: **c02a203 PASS** (0 red)

R1 (cycle 1, at 4176fc0) is fixed. The diff from 4176fc0 to c02a203 touches only `.github/workflows/ci.yml` and
`tests/workflows/merge-queue.test.ts`.

- The in-ci `commit-authors` job now has `contents: read` and `pull-requests: write`, the same as the standalone
  workflow. It runs the same script, so it takes the tool footer off itself. Whichever of the two jobs reads first,
  neither fails on a footer that is about to come off. The two PATCHes are idempotent: the second one reads the
  stripped body and writes nothing. The `edited` event that the strip causes reruns only the standalone workflow,
  which finds nothing to strip. So there is no loop.
- The test pins the job's permissions block to exactly `contents: read` and `pull-requests: write`, with one
  `: write` in the job. If the job goes back to read-only, or gains any other write, the test fails, so it is the
  check for R1. I also asked for a test that a footer body passes the in-ci path. It wasn't added as a separate
  test, and I accept that: the in-ci path is now the standalone path (same script, same permission), and the
  script's own tests cover the strip.
- A fork pull request still gets a read token, so it keeps today's behaviour: the footer fails it.
- The write is scoped to pull requests on this job only. It isn't granted at the workflow level, and the job runs
  only the committed script from a sparse checkout of `scripts`.

Everything else in audit 1's "Checked and fine" still holds. Notes N1 to N4 stand and none of them block.

`gate` had not finished on c02a203 when this was written. All three `commit-authors` runs on the head had passed.
This audit judges the code. The merge still needs a green `gate` on this head (or on a later head this review
covers).

Full audit: `docs/superpowers/audits/2026-11-26-public-ci-speed-step7-site-2-implementation-audit.md`, to be committed by the author.
