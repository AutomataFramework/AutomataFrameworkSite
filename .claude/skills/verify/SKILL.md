---
name: verify
description: Use when a change alters what the product does, before calling it done and before each commit that changes behavior: starts this repo's app or game from a clean checkout and drives it the way a person would.
---

# Verify

The Automata Framework website: one coming-soon page with a waitlist form, the waitlist's own small pages and a privacy page, and a 404 page, built by Vite into `dist/`. The waitlist's form posts go to Pages Functions (`functions/`), which keep sign-ups in a D1 database and send the confirmation email through the mailer Worker (`mailer/`).

## Start it

From a clean checkout in a cloud container, in order. First pick the Node version (or other runtime) that `engines` in `package.json` asks for. Then install, build, and start every stand-in for an outside service (a database, payments, mail, sign-in), never the real one.

`engines` asks for Node 24; the container's default `node` is 22, so every `pnpm` command runs with `export PATH=/opt/node24/bin:$PATH` in the same call (never beside `git` or `curl`). That folder has no `pnpm`: `pnpm` is `/opt/node22/bin/pnpm`, still on the PATH after the line above, and it runs under the Node 24 first on the PATH (`pnpm exec node -v` prints v24). The site has no payments or sign-in. Its database and mail have local stand-ins, never the real ones: a local D1 database with the migrations applied, and the mailer under `wrangler dev`, whose `send_email` binding sends nothing and writes each email's text and HTML under `mailer/.wrangler/tmp/email/`. The site's server is `wrangler pages dev`, which serves `dist/` and runs the functions the way Cloudflare Pages does, with no account, as `playwright.config.ts` does. The two find each other through a registry folder of their own (`WRANGLER_REGISTRY_PATH`): an entry a killed server leaves in the shared one points the site at a mailer that is gone, and every email then fails.

Start clean from a fresh clone in the scratchpad, never in your own checkout, so nothing untracked there is touched. Set `SCRATCH` to the session's scratchpad first. The clone takes the checkout's committed `HEAD`: commit before you run it.

Run it as four separate Bash calls, in order, with the full scratchpad path where it says `<scratchpad>` (the rule hooks refuse a call that sets `PATH` beside `git`, `curl` or a script, a `rm` of a filled-in path beside `git`, a shell function, and `${SCRATCH:?...}`).

Call 1: clear the old copy.

```sh
export SCRATCH=<scratchpad>; rm -rf "$SCRATCH/site-verify"
```

Call 2: the clone.

```sh
export SCRATCH=<scratchpad>; git clone -q "$(git rev-parse --show-toplevel)" "$SCRATCH/site-verify"
```

Call 3: Node 24, install, build, start (no `git` or `curl`).

```sh
export PATH=/opt/node24/bin:$PATH SCRATCH=<scratchpad> WRANGLER_SEND_METRICS=false; cd "$SCRATCH/site-verify"; export WRANGLER_REGISTRY_PATH="$PWD/.wrangler/journeys-registry"; pnpm install --frozen-lockfile; pnpm build; pnpm exec wrangler d1 migrations apply automata-waitlist --local --persist-to .wrangler/journeys; (cd mailer && pnpm exec wrangler dev --ip 127.0.0.1 --port 8791 --inspector-port 9231 --persist-to ../.wrangler/journeys > "$SCRATCH/mailer.log" 2>&1 &); sleep 8; pnpm exec wrangler pages dev dist --ip 127.0.0.1 --port 8788 --persist-to .wrangler/journeys --binding WAITLIST_SECRET=local > "$SCRATCH/wrangler.log" 2>&1 &
```

Call 4: wait for it (no `PATH` line).

```sh
export SCRATCH=<scratchpad>; for i in $(seq 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/)" = 200 ] && break; sleep 1; done; [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/)" = 200 ] && echo READY || { echo "NOT READY: no 200 from 127.0.0.1:8788 after 60 tries" >&2; tail -n 20 "$SCRATCH/wrangler.log" >&2; false; }
```

It is ready when the last line prints READY: `curl http://127.0.0.1:8788/` answers 200 and the log says "Ready on http://127.0.0.1:8788". If it prints NOT READY, read the log lines it shows and see "When it breaks". Start times, timed with `date` before and after: the cold first start in a new container (nothing installed or cached yet) took about 21 to 23 seconds, on commit e379aea; a later clean start, with the pnpm store warm, took 11 seconds in my run and 13 to 14 in a fresh session's (install and build 8, the server a few more), on commit 2fc87ac.

## Drive it

Open it in a real browser: the Chromium and Playwright the container already has (`require('playwright')`, then `chromium.launch()`), at the sizes the change affects (see "Shoot what the change touches" in `visual-check`). Tap, click, type and press keys the way a person would, and find things by their label or role. Take a screenshot at deviceScaleFactor 1 for your own check, and save it in the scratchpad, never in the repo. The main screen, what it shows and how to use it:

The main screen is the home page, `http://127.0.0.1:8788/`. It shows the wordmark "automata" in the top bar, the heading "Coming soon." (the role `heading`, level 1), one sentence that says what Automata Framework is, then the waitlist: the heading "Be first in line." (level 2), the field "Your email", the group "Which editor do you want first?" of seven cards (radios: Screens, World, Characters, Feel, Sound, Story, Not sure yet), the button "Add me to the list" and a "How we keep your email" link; and "Privacy" and "Font licences" links in the footer. Wait for the `h1` and for `document.fonts.ready`, then take the screenshot. It has no script. Sizes: small phone 390 by 844, tablet 820 by 1180, computer 1440 by 900 (the list is in `tests/journeys/page.ts`; the file wins where it differs).

## The journeys

One line each, from a person's side: where it starts, the steps, and what they see at the end.

- Arrive: open the home page; it says "Coming soon." and what Automata Framework is, in both fonts, readable, no wider than the screen.
- Licences: press "Font licences" in the footer; the fonts' licence notices open as plain text.
- Missing page: open an address that does not exist; the page answers 404, says so, and "Go to the home page" goes home.
- Join: type an email, tap a card, press "Add me to the list"; "Check your email." The email is the newest file under `mailer/.wrangler/tmp/email/*/email-text/` that names the address; open its confirm link, press "Yes, add me"; "You're on the list." Its leave link and "Take me off the list" give "You're off the list." The row is in the local database (`tests/journeys/waitlist-stand-ins.ts` reads it).
- Privacy: "How we keep your email" opens the privacy page.
- The rest are in `tests/journeys/` (home, not-found, hosting, waitlist, live); run the ones the change reaches with `pnpm exec playwright test --project=chromium <file>` while the server is up. The container has only Chromium; WebKit and Firefox run in CI.

## Stop it

Stop every server it started and delete the clone, so the next run starts clean. Your own checkout is never cleaned.

```sh
pkill -f 'wrangler pages dev'; pkill workerd
rm -rf "$SCRATCH/site-verify" "$SCRATCH/wrangler.log"
```

Check it: `test -e "$SCRATCH/site-verify" || echo gone` prints gone, and `curl -s http://127.0.0.1:8788/` no longer answers.

## When it breaks

A step that breaks or flakes is fixed in this skill first. Each known way a start or a step fails, what it looks like, and the fix:

- Port 8788 already in use: `curl` answers at once but shows an old build. Run the stop commands, then start again.
- NOT READY after 60 tries: the server did not answer 200. The lines printed from `$SCRATCH/wrangler.log` say why (a build error, a port in use); fix that, run the stop commands, then start again.
- `SCRATCH` not set: the first line stops with "set SCRATCH to the scratchpad". Set it to the session's scratchpad folder.
- `pnpm` or `node` not found, or `engines` complaints: the PATH line was skipped; Node 22 is the default. Use `/opt/node24/bin`.
- The words show in Georgia or the device's sans font: the screenshot was taken before the fonts arrived. Wait for `document.fonts.ready`.
- `wrangler` prints a metrics prompt or stalls: set `WRANGLER_SEND_METRICS=false`.
