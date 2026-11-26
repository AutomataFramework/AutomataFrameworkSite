# Implementation audit: public CI speed, step 6 gap fix, Site (cycle 2)

Verdict: **12ebe57 PASS** (0 red)

Examined: AutomataFrameworkSite draft PR #124 at 12ebe57 (new since cycle 1: 12ebe57 only), against cycle 1's red. Run: `ci` [45765934748](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45765934748) on 12ebe57, green (full, because `.github/` changed).


## Cycle 1's red: fixed

`pnpm-workspace\.yaml` is in `plan`'s rerun-everything pattern, and `pnpm-workspace.yaml` is in the `test.each` list.

## The table test

`DRAFT_RUNS` names every top-level path in `git ls-files` (23 at 12ebe57) and what a draft that changes it runs. The test fails when:
- a new top-level path appears with no row;
- a row names a path that no longer exists;
- `plan`'s script disagrees with a row.

I checked the rows that skip the journeys:
- `.claude`, `.gitignore`, `LICENSE`, `README.md`, `biome.json` and `knip.json` all say "no journeys".
- None of them is read by the build, the journey server or the journeys. `grep` over `src/`, `scripts/`, `tests/journeys/`, `public/`, the two HTML files and the configs finds only the game's `LICENSE` in `src/features/facts/parse.ts`, read from the game source, not this repo's file.
- Lint and knip run whole on every draft.

## Notes (not blocking)

- **Two folders are represented by one sample file.** `tests/` is tested with `tests/fixtures/contrast.ts` and `docs/` with one note. Their other sub-paths (`tests/journeys/`, `tests/features/`) are tested elsewhere, as the comment says. A new top-level folder still has to get its own row.
