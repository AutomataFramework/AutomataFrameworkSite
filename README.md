# Automata Framework: the website

The website for Automata Framework, at https://automataframework.com. For now it is one page that says the framework
is coming soon, and a page for a missing address.

- **The site is static files**, built by Vite into `dist/` and hosted on Cloudflare Pages. Every merge to `main`
  uploads it, and the `site` workflow checks that the live address then serves that exact build.
- **The site has its own look**: palette No. 325 (deep green ground, yellow words, ocher for what can be pressed) and
  the fonts Fraunces and Onest. The colours and fonts are in `src/styles.css`. The fonts' licences are served at
  `/licences.txt`.
- **Tests run in GitHub Actions.** `pnpm lint`, `pnpm typecheck`, `pnpm knip` and `pnpm test:node` are quick checks
  you can run before you push. The journeys (`pnpm test:journeys`) drive the built site in Chromium, WebKit and
  Firefox.

## Try it on your machine

You need [Node](https://nodejs.org) 24 or newer and [pnpm](https://pnpm.io). Then, from this folder:

```
pnpm install
pnpm build
pnpm exec wrangler pages dev dist
```

- `pnpm install` fetches what the site needs.
- `pnpm build` makes the whole site in the `dist/` folder.
- `pnpm exec wrangler pages dev dist` serves that folder the way Cloudflare Pages does. Open <http://localhost:8788>.

Something went wrong? Read the last line the command printed: it says what is missing. The most common cause is an older
Node, so check `node --version` says 24 or higher.
