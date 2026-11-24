// Thin wrapper for `pnpm build`: opens the built site (dist/) in Chromium once and saves the game's picture, the share
// picture, the touch icon and favicon.ico beside its pages. CHROMIUM_PATH points at a Chromium that Playwright did not install.
import { PictureError, takePictures } from '#src/build.ts'

try {
  const executablePath = process.env.CHROMIUM_PATH
  await takePictures({
    siteDir: 'dist',
    ...(executablePath === undefined || executablePath === '' ? {} : { executablePath }),
  })
  console.log(
    'Took the pictures: dist/game.png, dist/share.png, dist/apple-touch-icon.png and dist/favicon.ico.',
  )
} catch (error) {
  if (!(error instanceof PictureError)) throw error
  console.error(error.message)
  process.exit(1)
}
