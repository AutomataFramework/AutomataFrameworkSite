# Implementation audit: public CI speed, step 6 gap fix, Site (cycle 1)

Verdict: **b4a2b16 FAIL: 1 red**

Examined: AutomataFrameworkSite draft PR #124 at b4a2b16 (one commit on `main`), against criterion 5 of Framework's `docs/superpowers/plans/2026-11-26-public-ci-speed.md` ("The inputs that rerun everything are listed in the workflow") and step 6's finding on throwaway #123 (draft run 45764722472, green with `journeys=false` after `compatibility_date` was set to 2099). Runs on b4a2b16 were still in progress when this audit was written. The red below is in the code, not the run.


## What holds

- `wrangler.toml` is added to `plan`'s rerun-everything pattern, so a draft that changes it gets `full=true`, `journeys=true`.
- The new `docs-only.test.ts` cases run `plan`'s own script on `wrangler.toml`, `playwright.config.ts` and `vite.config.ts`. The `wrangler.toml` case fails without the fix, as the author reports.
- The other inputs the journeys and their server read are covered:
  - the build: `vite.config.ts`, `src/`, `scripts/`, `index.html`, `404.html`, `public/` (including `_headers`), `tsconfig.json`;
  - the stand-in game: `tests/fixtures/`;
  - the journeys and their helpers: `tests/journeys/` and `tests/fixtures/contrast.ts`;
  - `playwright.config.ts`, `package.json` and `pnpm-lock.yaml`.

  Site has no `functions/` folder.

## Red

1. UNIT: `.github/workflows/ci.yml`, `plan`, the rerun-everything pattern (b4a2b16 line 70). VERDICT: red.
   - REQUIREMENT: criterion 5, "The inputs that rerun everything are listed in the workflow". The coordinator's ask was to check whether any other config the journey server reads is still missing.
   - REASON: `pnpm-workspace.yaml` is missing, and the journeys' server depends on it in the same way as on `wrangler.toml`. Its own comment says: "`onlyBuiltDependencies`: esbuild, workerd ... `wrangler pages dev` needs both to serve the site."
   - The lockfile does not record that setting. `pnpm-lock.yaml` `settings:` holds only `autoInstallPeers` and `excludeLinksFromLockfile`.
   - WHAT GOES WRONG: a draft that changes only `pnpm-workspace.yaml`, for example dropping `workerd`, passes `pnpm install --frozen-lockfile` with workerd left unbuilt. It gets `full=false` and `journeys=false` (the path is in neither list), so no server starts, and the draft goes green. That is the exact class of miss #123 found.
   - Examples already lists `pnpm-workspace.yaml` in its pattern.
   - EXPECTED: `pnpm-workspace\.yaml` in the pattern, and `pnpm-workspace.yaml` added to the new `test.each` list.
   - FIX: one regex alternative and one test case.

## Notes (not blocking)

- **The rule is easy to break again.** Every repo's rerun-everything list is hand-written. A test could assert that every tracked top-level file outside `docs/`, `CLAUDE.md`, `README.md`, `LICENSE` and `.gitignore` matches either the rerun-everything pattern or one of `plan`'s path lists. A new config file would then fail CI until someone decides where it goes. That is a choice for the plan amendment, not this PR.
