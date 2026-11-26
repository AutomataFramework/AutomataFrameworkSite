import { expect, test } from 'vitest'
import { PictureError, settled } from '#src/features/pictures/pictures.ts'

// Chromium once refused a screenshot of the built site with no word of which picture it was taking (Site run
// 45774019817). A refusal now stops the build with a plain sentence that names the picture.
test('a screenshot Chromium refuses names the picture it was for', async () => {
  const page = {
    screenshot: async (): Promise<Buffer> => {
      throw new Error(
        'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot',
      )
    },
  }
  const failure = await settled(page, 'game.png', 1_000, true).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(PictureError)
  expect((failure as Error).message).toMatch(/^game\.png: Chromium could not take the picture/)
  expect((failure as Error).message).toContain('Unable to capture screenshot')
})

test('two pictures in a row with the same bytes are the picture', async () => {
  const shots = [Buffer.from('a'), Buffer.from('b'), Buffer.from('b')]
  const page = { screenshot: async (): Promise<Buffer> => shots.shift() ?? Buffer.from('c') }
  expect((await settled(page, 'share.png', 5_000, false)).toString()).toBe('b')
})
