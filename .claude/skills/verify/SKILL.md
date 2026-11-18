---
name: verify
description: Use when a change alters what the product does, before calling it done and before each commit that changes behavior: starts this repo's app or game from a clean checkout and drives it the way a person would.
---

# Verify

The Automata Framework website: a static home page, built by Vite into `dist/`, with a stand-in game shown in a frame that plays itself and starts for real when Play is pressed.

## Start it

From a clean checkout in a cloud container, in order. First pick the Node version (or other runtime) that `engines` in `package.json` asks for. Then install, build, and start every stand-in for an outside service (a database, payments, mail, sign-in), never the real one.

`engines` asks for Node 24; the container's default `node` is 22, so every command runs with `export PATH=/opt/node24/bin:$PATH`. That folder has no `pnpm`: `pnpm` is `/opt/node22/bin/pnpm`, still on the PATH after the line above, and it runs under the Node 24 first on the PATH (`pnpm exec node -v` prints v24). The site has no database, payments, mail or sign-in. The game in the frame is the stand-in in `tests/fixtures/game`, unless `GAME_SOURCE` names another game's repo folder. The server is `wrangler pages dev`, which serves `dist/` the way Cloudflare Pages does, with no account, as `playwright.config.ts` does.

```sh
export PATH=/opt/node24/bin:$PATH SCRATCH=${SCRATCH:-/tmp}
pnpm install --frozen-lockfile
pnpm build
WRANGLER_SEND_METRICS=false pnpm exec wrangler pages dev dist --ip 127.0.0.1 --port 8788 > "$SCRATCH/wrangler.log" 2>&1 &
until curl -s -o /dev/null http://127.0.0.1:8788/; do sleep 1; done
```

It is ready when `curl http://127.0.0.1:8788/` answers 200 and the log says "Ready on http://127.0.0.1:8788". Last clean start, timed with `date` before and after: 11 seconds from `git clean -xfd` in my run, 13 to 14 in a fresh session's (install and build 8, the server a few more), on commit 2fc87ac.

## Drive it

Open it in a real browser: the Chromium and Playwright the container already has (`require('playwright')`, then `chromium.launch()`), at each size in the device matrix in Settings. Tap, click, type and press keys the way a person would, and find things by their label or role. Take a screenshot at deviceScaleFactor 1 for your own check, and save it in the scratchpad, never in the repo. The main screen, what it shows and how to use it:

The main screen is the home page, `http://127.0.0.1:8788/`. Open it with `reducedMotion: 'reduce'`, as the journeys do, or the screenshot catches the page while it is still arriving. A first visit to the real game asks for a language, so seed `localStorage` before the page loads with the key `automata.crate-game.settings` and the value `{"format":1,"sections":{"language":{"format":1,"language":"en"}}}`. It shows the wordmark "automata"; on a tablet or computer (700 pixels wide or more, `BAR_AT` in `tests/journeys/home.ts`) the bar also holds "What works today", "GitHub" and the button "Play the game", and on a small phone the bar is only the wordmark; the claim "Finish the game your agent started.", and the game's sheet with a "Play it" button. Wait for the `h1` (the role `heading`, level 1), then take the screenshot. There are up to three Play buttons, found with `getByRole('button', { name, exact: true })`: "Play the game" in the bar (tablet and computer only), "Play the first game" in the hero, and "Play it" on the game's sheet; "Play" alone matches none. The journey presses "Play it": the game starts inside the page, and `#game` gets `data-state="playing"`. Sizes: small phone 390 by 844, tablet 820 by 1180, computer 1440 by 900 (the list is in `tests/journeys/sizes.ts`; the file wins where it differs).

## The journeys

One line each, from a person's side: where it starts, the steps, and what they see at the end.

- Play: open the home page, press "Play it" (or the bar's Play button); the picture goes, the game's own frame appears and the sheet says it is playing.
- Read: open the home page and scroll; "What works today" in the bar, the tag and the footer all go to the list of five claims, each with a stamp.
- Missing page: open an address that does not exist; the page answers 404, says so, and offers the way home.
- The rest are in `tests/journeys/` (arrive, bar, facts, fallbacks, home, hosting, links, live, look, motion, not-found, play, share, touch); run the ones the change reaches with `pnpm exec playwright test --project=chromium <file>` while the server is up.

## Stop it

Stop every server it started and clear what it wrote, so the next run starts clean.

```sh
pkill -f 'wrangler pages dev'; pkill workerd
git clean -xfd
```

Run the second line only when nothing you want to keep is untracked (`git status --short`); it also removes `node_modules`, so the next start installs again. Check it: `git clean -ndx | wc -l` prints 0. Do not add `-e docs`: it is not anchored, so it also keeps every nested `docs` folder inside `node_modules`.

## When it breaks

A step that breaks or flakes is fixed in this skill first. Each known way a start or a step fails, what it looks like, and the fix:

- Port 8788 already in use: `curl` answers at once but shows an old build. Run the stop commands, then start again.
- `pnpm` or `node` not found, or `engines` complaints: the PATH line was skipped; Node 22 is the default. Use `/opt/node24/bin`.
- The first screenshot is faded or the text is half there: motion was not reduced. Open the page with `reducedMotion: 'reduce'`.
- A language picker covers the page: the `localStorage` seed above was not set before `goto`.
- `wrangler` prints a metrics prompt or stalls: set `WRANGLER_SEND_METRICS=false`.
