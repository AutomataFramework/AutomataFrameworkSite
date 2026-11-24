---
name: this-repo
description: "Use when working in this repo: its layout, its CI and its own rules"
---

# This repo

What is particular to this repo, kept from its earlier notes and the 2026-11-16 handoff.

- **The site is static files on Cloudflare Pages**, at https://automataframework.com, its own domain (the Owner,
  2026-11-24), on the Pages project the 2026-11-13 setup made. `deploy` is the only job that holds the Cloudflare
  token, and it never runs the game's code.
- **The site does not depend on the framework.** The demo game is built by its own repo
  (AutomataFrameworkExamples, `pnpm build`), copied to `/play/` and shown in a frame. The site shows the newest commit
  on the game's `main` whose checks all passed, never an unchecked one.
- **Every claim on a page is true on `main` today.** A sentence that is true only on a branch, or only in one browser,
  is a defect.
- **Every number, name, hash and stamp on the home page comes from the game's own files**, through `facts` (reads the
  game's folder into `dist/facts.json`), `claims` (the five claims, each stamp held to a proof) and `fill` (writes
  them into the page). None is typed in `index.html`. `build` and `build-real` open the built game once in a browser
  (`pictures`) to take its picture, the share picture and the touch icon; `deploy` still never runs the game.
- **The game plays itself before anyone presses Play** (the Owner, 2026-11-14). Once the page has loaded and the game's
  place is near, the page asks for `/play/?watch`: the game's watch mode, which plays its recorded run in the picture's
  own box, for every visitor whatever their device says about motion, but not for one whose device asked to save data
  (the game is about 1.2 MB; they keep the picture until Play), and only when the browser has a moment to spare. Play
  (or a tap on the moving game)
  sends `{ automata: 'play' }` to the same frame, which starts for real; the game tells the page its state with
  `{ automata: 'state', state }`. Each side checks who sent a message and where from. A game that cannot watch leaves
  the picture, and Play loads it as it always did. The picture is still there first, and what is in `public/_headers`
  does not change for it.
- **The build tools the site's pages are made with** read the game's repo folder through `GAME_SOURCE`, never import
  the framework. The page's name is "Automata Framework", two words; the wordmark is the word `automata`, with no mark.
- **Site copy is where strategy leaks.** Words on a page come from the public spec and READMEs. Nothing is copied from
  the private notes; a plan may say "the brief is in the private notes" and no more.
- **Dependencies the Owner approved for this repo** (2026-11-13): `wrangler` 4.140.0, `@playwright/test` 1.63.0,
  `@types/node` 24.19.1, and (2026-11-14, for the site's look) `@fontsource-variable/fraunces` 5.3.0,
  `@fontsource-variable/onest` 5.3.1, `@fontsource/jetbrains-mono` 5.3.0 and `@phosphor-icons/core` 2.1.1, all
  development-only; and `lenis` 1.3.27 (the Owner, 2026-11-14, for very subtle smooth scrolling; Vite bundles it into
  the page, so it is self-hosted under the strict header). `knip.json` is told to ignore the four fonts-and-icons
  packages, because knip reads neither CSS `@import`s (the fonts) nor the icon reader's `import.meta.resolve` (the
  icons).
- **The site has its own palette and fonts** (the spec's "Visual direction"; the Owner picked them, 2026-11-14).
  Palette No. 325 from *A Dictionary of Color Combinations*: `ground` (Deep Slate Green), `words` (Naples Yellow),
  `touch` (Yellow Ocher) and `mark` (Eugenia Red), and two shades mixed from them, `raised` (6% words in the ground)
  and `quiet` (70%). Those six are named only in `src/styles/base.css` (the sheet is split by page part into
  `src/styles/`, and `src/styles.css` imports the parts in order), and `tests/styles/` holds every part to them. `touch`
  is only for what can be touched, and `mark` is an edge or an icon and never carries words (it is 3.64 to 1 on the
  ground). Fonts: Fraunces for the claim, titles and wordmark, Onest for words and labels, JetBrains Mono for numbers
  and file names. Dark is the only theme. Nothing is drawn on or over the game: its art is never restyled.
- **The fonts' and icons' licence notices** are in `public/licences.txt` (the Owner, 2026-11-14), served at
  `/licences.txt`. Move a font or icon package to a new version, and copy its `LICENSE` there again.

## Fast CI here

- Set up in `.github/workflows/ci.yml` and the `journeys.yml` it calls. A draft runs the whole Node suite
  (CLAUDE.md, CI speed); the journeys in Chromium only, stopping at the first failure (`--max-failures=1`), and only when the site's
  own files (`src/`, the pages, `public/`, `scripts/`) or the journeys changed, or the pull request has the
  `screenshots` label (the journeys take the pictures). When only journeys changed, just those play (Playwright
  `--only-changed=origin/main`); a change to the site reaches every journey.
- The full run's six shards are `journeys / shards (<engine> <n>/2)`, with `journeys / engines (<engine>)` checks.
  `site.yml`'s real-game journeys always run whole.
- The docs-only path never covers the README.

## Structure

```
index.html, 404.html          the pages (Vite's entries)
public/                       files served as they are (`_headers`)
src/index.ts                  the page's entry
src/styles.css, src/styles/   the stylesheet: styles.css imports the parts (base, bar, hero, parts, sizes, motion) in order
src/build.ts                  the entry for Node: what the scripts use, nothing that needs a page
src/lib/                      shared helpers, no feature logic
src/features/<feature>/       <feature>.ts entry, <part>.ts one job per file
                              (lowest first: version, pick, facts, claims, assemble, icons, fill, pictures, motion, play, page)
scripts/                      thin CLI wrappers
tests/architecture.test.ts    imports go down, no cycles, no tests in src, no file (a .ts, a .css, a journey) over 600 lines
tests/features/<feature>/     mirrors src/features
tests/fixtures/               shared test helpers and the stand-in game
tests/fixtures/game-source/   a made-up game's repo folder: automata.toml, content/, replays/, LICENSE
tests/journeys/               end-to-end journeys in real browsers, against the built site
tests/styles/                 checks that read the stylesheet's parts: the six colours, dark only, contrast
tests/workflows/              checks that read a workflow
tests/docs/                   checks that read the README
docs/superpowers/             specs/, audits/, live/, progress.md and history.md
```

Features import only from features below them. No top-level `components/`, `services/` or `utils/`.

`biome.json` turns off some rules for two files and says why here, since JSON has no comments: in `index.html`, the
accessibility rules that mistake a placeholder (`<a data-address="…">`, whose address the build fills in) and a
keyboard-reachable file panel for mistakes; in `src/styles/*.css`, `noDescendingSpecificity` (the sheet is ordered by
page part, not by specificity) and `noImportantStyles` (the one `!important` pair is the reduced-motion switch, which
must beat everything above it).
