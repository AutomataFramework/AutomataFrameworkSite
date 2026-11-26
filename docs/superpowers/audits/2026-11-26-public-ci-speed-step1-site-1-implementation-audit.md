# Implementation audit: public CI speed, step 1, Site (cycle 1)

Examined: AutomataFrameworkSite PR #117 at 8b1eccb (base `main` 65a8715), against step 1 of Framework's `docs/superpowers/plans/2026-11-26-public-ci-speed.md`, `release`, `review` and `build`. Runs checked on 8b1eccb: `ci` [45738399069](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45738399069) and `site` [45738350191](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45738350191).

Verdict: **8b1eccb PASS** (0 red).

## What was checked

- **The deploy path still gates on every engine.** `site.yml`'s `journeys-real` calls `journeys.yml` with its defaults: all three engines and `max-failures` 0. `deploy` needs `[pick, journeys-real]` with no status function in its `if`, so it runs only when the called workflow succeeded, which takes all 6 pieces green. Each piece runs every engine in turn and exits 1 if any engine failed, so one failing engine in one piece blocks the deploy. A cancelled or missing piece leaves the called workflow unsuccessful, which also blocks it. The old `engines` job (`if: always()`) did the same through a separate job. On the real-game run, all six `journeys-real / pieces (n/6)` were green, and piece 1's log shows `Running 50 tests ... shard 1 of 6` once each for chromium, webkit and firefox, each followed by `<engine> passed in piece 1/6`. `deploy` and `live` were skipped, as they should be off `main`.
- **The `ci` caller.** `journeys` passes all three engines on a full run and Chromium on a draft. `gate` uses the same expression for `ENGINES`, and `ci.test.ts` asserts the two are equal. `gate`'s new steps run only when the journeys apply. On the real run, all 6 pieces were green and `gate` printed 18 `ok` lines.
- **Per-engine `--output`.** Each engine writes to `ci-out/test-results/<engine>`, because Playwright empties its output folder when it starts. Without that, the second engine would erase the first one's failure trace. The failure upload is now `test-results-piece-n` from `ci-out/test-results/**`, and the Audit F7 test is updated to match. Pictures are copied aside per engine. No tracked `__screenshots__` exist.
- **Tests changed and named in the body:**
  - `ci.test.ts`: the old two-shards-and-engines test becomes six pieces and checks that the loop goes on past a failure. The F7 trace test follows the new path.
  - `docs-only.test.ts`: the `journeys / engines (...)` names go.
  - `names.test.ts` and `read.ts`: `journeys / pieces` and `journeys-real / pieces` replace the old `engines` names.
  - `browser-pieces.ts` and its test are added, byte-identical to Framework's, which passed there.
  - No test was deleted except through these rewrites.
- No retry, no wider timeout and no new skip. The "1 skipped" in webkit and firefox is `arrive.journey.ts:255` ("Only Chromium can be driven with a dragging finger"), which was already on `main`.
- Required checks on `main` are `gate` and `commit-authors`, so dropping the `journeys / engines (...)` names leaves no required name orphaned.

## Notes (not blocking)

- `site.yml` does not run `browser-pieces.ts`, so on a failed deploy the engine is named only by the piece's own log, not by a summary line. It still blocks the deploy, which is what matters.
- On a draft with `--only-changed` (only journeys changed), a piece's share of an engine can be empty. Playwright's handling of an empty shard under `--only-changed` should be seen once on a real draft that changes one journey, before relying on it. With 6 pieces instead of 2, this case is more likely than before.
- The pieces are uneven: 58 to 216 s in `ci`, and 70 to 396 s in `site`. Step 3 addresses that.
- The after numbers were not reviewed here; they go in the body.
