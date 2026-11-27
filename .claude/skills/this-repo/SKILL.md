---
name: this-repo
description: "Use when working in this repo: its layout, its CI and its own rules"
---

# This repo

What is particular to this repo.

- **The site is static files on Cloudflare Pages**, at https://automataframework.com, its own domain (the Owner,
  2026-11-24), on the Pages project the 2026-11-13 setup made. `deploy` in `site.yml` is the only job that holds the
  Cloudflare token.
- **For now it is one coming-soon page** (the Owner, 2026-11-27: "reset now"), plus a 404 page. The old demo-game site
  (its game frame, facts, claims, pictures and real-game build) was removed; git history has it. The site is updated at
  the end of each slice of the new framework.
- **The waitlist** (spec `docs/superpowers/specs/2026-11-27-waitlist-design.md`): the home page's form posts to Pages
  Functions (`functions/`, thin files over `src/waitlist/`), which keep sign-ups in the D1 database `automata-waitlist`
  (`migrations/`) and send the confirmation email through the mailer Worker (`mailer/`, reached only by its service
  binding; it also runs the daily clean-up). Cloudflare applies `_headers` only to static files, so every function
  answer sets the same safety headers itself (`src/waitlist/headers.ts`, kept equal by a test). Nothing on the page
  uses a script. The Owner counts sign-ups with
  `pnpm dlx wrangler@4.140.0 d1 execute automata-waitlist --remote --command "SELECT editor, COUNT(*) FROM signups WHERE status = 'joined' GROUP BY editor"`.
- **The site does not depend on the framework.** It imports nothing from it.
- **Every claim on a page is true on `main` today.** A sentence that is true only on a branch, or only in one browser,
  is a defect.
- **Site copy is where strategy leaks.** Words on a page come from the public spec and READMEs. Nothing is copied from
  the private notes; a plan may say "the brief is in the private notes" and no more.
- **The build** is `vite build`, which also writes `dist/version.txt`: the commit it was built from (`SITE_COMMIT`), so
  `site.yml`'s `live` job can wait until the live address serves exactly that build.
- **Dependencies the Owner approved for this repo** (2026-11-13): `wrangler` 4.140.0, `@playwright/test` 1.63.0,
  `@types/node` 24.19.1, and (2026-11-14, for the site's look) `@fontsource-variable/fraunces` 5.3.0 and
  `@fontsource-variable/onest` 5.3.1, all development-only. `knip.json` is told to ignore the two font packages,
  because knip does not read CSS `@import`s, and `cloudflare`, the mailer's `cloudflare:workers` import, which the
  Workers runtime provides.
- **The site has its own palette and fonts** (the Owner picked them, 2026-11-14). Palette No. 325 from *A Dictionary of
  Color Combinations*: `ground` (Deep Slate Green), `words` (Naples Yellow) and `touch` (Yellow Ocher), and two shades
  mixed from them, `raised` (6% words in the ground) and `quiet` (70%). They are named only in `src/styles.css`. `touch`
  is only for what can be touched. Fonts: Fraunces for titles and the wordmark, Onest for words. Dark is the only theme.
- **The fonts' licence notices** are in `public/licences.txt`, served at `/licences.txt`. Move a font package to a new
  version, and copy its `LICENSE` there again.

## Owner rules here

The owner's own rules for this repo, beside the ones in CLAUDE.md (they are not on the workflow page, so they live here, as CLAUDE.md says).

- CI speed (the owner, 2026-11-21): a job that drives a browser runs in Playwright's own image for the locked version, pinned by digest, and installs no browser or system library (`playwright install` and `install-deps` hung on the runner's package mirror until the job's timeout). A draft runs the whole Node suite when it takes under 30 seconds in CI; picking tests by the change (`--changed`) is only for a longer suite. The rest of making CI fast is in `release`.
- **An app, not a web page.** Every screen of an app (every editor) behaves like an app on a touch screen: holding words outside a field picks nothing, the page never scrolls or bounces (only a part meant to scroll does, and it keeps the swipe to itself), a tap or a hold lights no grey box (the keyboard focus ring stays) and opens no browser menu, two quick taps never zoom, a pinch zooms only a part meant to zoom (such as a level or the world map) and never the page, and nothing drags off as a picture; a field still lets its words be picked. A repo with app screens checks it by a program on every screen, named in its `this-repo` skill.

## Fast CI here

- Set up in `.github/workflows/ci.yml`. Every run runs the whole Node suite (it takes seconds). A draft plays the
  journeys in Chromium only, stopping at the first failure, and its checks are named `quick …`; a ready pull request,
  `main`, the merge queue and the `full-tests` label play them in Chromium, WebKit and Firefox. The site is one page,
  so every change reaches every journey, and the journeys run as one job, not in pieces.
- A pull request that changes only `CLAUDE.md` or Markdown under `docs/` is docs-only: `docs` stands in for `check`
  and `build`. The README is never docs-only, because a test reads it.

## Pull request bodies here

- When the GitHub MCP tool adds its own footer to a pull request body, set the whole body again with
  `mcp__github__update_pull_request` (its `body` field), then read the pull request back and check that the last
  line is "Requested by **McThayDT**". `gh pr edit` does not work in cloud sessions: it needs GitHub's GraphQL API,
  which is blocked there.

## Structure

```
index.html, 404.html          the pages (Vite's entries)
src/styles.css                the one stylesheet: the colours, the fonts, the layout
privacy/, waitlist/*/          the privacy page and the waitlist's small pages (two are templates the functions fill)
src/waitlist/                 the waitlist's logic: rules, tokens, the store, the email, headers, the site's handlers
functions/                    Pages Functions: one thin file per address the waitlist answers
mailer/                       the mailer Worker and its own wrangler.toml
migrations/                   the D1 database's migrations
public/                       files served as they are (`_headers`, the icon, `licences.txt`)
scripts/check-commit-authors.ts   the commit and pull request words check `ci` and `commit-authors` run
tests/journeys/               end-to-end journeys in real browsers, against the built site
tests/workflows/              checks that read a workflow
tests/scripts/, tests/docs/   checks of the script and of the README
tests/fixtures/contrast.ts    the contrast ratio the journeys use
tests/fixtures/sqlite-db.ts   a real SQLite database with the migrations, behind D1's calls, for the Node tests
tests/waitlist/               the waitlist's Node tests
docs/superpowers/             specs/, audits/, live/, progress.md and history.md
```
