# Site #88: implementation audit, cycle 1 (lane 2)

Audit 2026-11-24 15:19 UTC (from `date`). Commit examined: `b83e58d`, the head of `claude/project-thread-vrfy1o`. It is
`f21dee2` (the icon change) plus the commit that removes the live-state file, on top of `main` at `8d13bda`. Fresh
session; it did not build this change.

Brief: the Owner's ask (2026-11-24 15:02 UTC) for a real icon, "automata" in the site's font and colours, and the
Owner's card choice (15:11 UTC): a big "a" in browser tabs, the whole word on phones. Acceptance criteria are the five in
the pull request body.

## Criteria

1. Both icons name the ground and the words colour and no other: PASS. `tests/styles/tokens.test.ts` checks
   `icon.svg` and `touch-icon.svg` against `BOOK.ground` (`#112f2c`) and `BOOK.words` (`#fbe6a0`); both files hold only
   those two colours.
2. `/favicon.ico` holds three PNGs at 16, 32 and 48 px, none one flat colour: PASS. The new journey test passed here in
   Chromium. I also read the built `dist/favicon.ico` by hand: count 3, sizes 16, 32, 48, each a real picture of the "a"
   (sheet below).
3. `/touch-icon.svg` is served as SVG and `/apple-touch-icon.png` stays 180 x 180: PASS (journey, Chromium). The built
   `apple-touch-icon.png` shows the word, cream on dark green.
4. `packIco` writes a correct table and refuses a size over 256: PASS (`tests/features/pictures/ico.test.ts`, 2 tests).
   I read `ico.ts` against the ICO layout: 6-byte header (reserved 0, type 1, count), 16-byte entries (width and height
   as one byte with 256 as 0, no palette, 1 plane, 32 bpp, length, offset), then the PNGs in entry order. Correct.
5. Lint, knip, typecheck, Node suite and CI: PASS. Here: `pnpm lint && pnpm knip` and `pnpm typecheck` clean;
   `pnpm test:node` 34 files, 323 tests passed (`main` at `8d13bda`: 320); `pnpm build` wrote all four pictures. CI on
   `b83e58d`: see "CI" below.

## Exploratory checks

- **It really is the wordmark's font.** The site loads `@fontsource-variable/fraunces/opsz.css`, and `.wordmark` is
  `600 24px`, so the browser picks optical size 24. I made a Fraunces 5.3.0 instance at `wght 600, opsz 24` with
  fontTools, laid out "a" and "automata" from its own outlines and advances, scaled them to each icon's box and laid
  them over the icon paths in Chromium. Overlap (intersection over union of the filled pixels): `icon.svg` 0.9945,
  `touch-icon.svg` 0.9938. The scaled height matches to 0.5 px of 512 in both. The small rest is the path's 0.1 rounding.
  So the icons are the real glyphs, not a look-alike.
- **Every page gets it.** `index.html` and `404.html` both link `/icon.svg` and `/apple-touch-icon.png`; a browser that
  cannot show SVG now finds `/favicon.ico` on its own.
- **No font file needed.** Both SVGs are one rectangle and one path; nothing refers to a font.
- **Size on a phone.** At 180 px the word is about 150 px wide and 20 px tall; on a 60 px home-screen tile it is small
  but readable (sheet below). The Owner saw the options at real size and chose this, so it is not reopened here.
- **knip.** `packIco` and `FAVICON` are re-exported through `src/build.ts` (an entry), the same way `serveFolder` and
  `PICTURES` already are.
- **Tests changed.** The body names the one changed test (`tokens.test.ts`) and why; the old check pinned the gold
  square the Owner asked to replace.
- **Identity.** Both commits are McThayDT's (author and committer); the body ends "Requested by **McThayDT**". The
  live-state file is removed at the head.

Sheet of the built icons (real size and 6x, and the touch icon at 180 px and 60 px with rounded corners): looked at by
this session, `/tmp/claude-0/rv/sheet.png`, not kept.

## CI

On `b83e58d` when this was written: `quick check`, `quick build`, `plan`, `commit-authors`, `pr-rules` and both Chromium
journey shards passed. The three engine journeys (Chromium, WebKit, Firefox) were still queued. WebKit and Firefox are
not installed in this container, so I could not run them here; their result is the merging session's to read.

## Notes (not blocking)

- N1. The body's "Ran here" says "323 passed, plus 2 new". The suite has 323 tests in all, three more than `main`
  (the colour check now runs once per icon, and two `packIco` tests). Suggest "323 passed (320 on `main`)".

No red findings.

Verdict: `b83e58d` PASS.
