// Builds the pages into dist/, and writes dist/version.txt: the commit the site was built from (SITE_COMMIT, or
// "local"), so a deploy can wait until the live address serves exactly this build.
import { defineConfig, type UserConfig } from 'vite'

// The waitlist's pages: where each form post lands, and the two templates its functions fill with a link's token.
const WAITLIST_PAGES = [
  'check-email',
  'try-again',
  'busy',
  'joined',
  'left',
  'link-expired',
  'confirm',
  'leave',
]

// Annotated because the repo's tsconfig demands explicit types on everything exported.
const config: UserConfig = defineConfig({
  plugins: [
    {
      name: 'version',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.txt',
          source: `${process.env.SITE_COMMIT ?? 'local'}\n`,
        })
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The safety header allows fonts only from the site's own address, so no font may be inlined as a data: address.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: 'index.html',
        'not-found': '404.html',
        privacy: 'privacy/index.html',
        ...Object.fromEntries(WAITLIST_PAGES.map((page) => [page, `waitlist/${page}/index.html`])),
      },
    },
  },
})

export default config
