// A missing address, at every size, in every engine: the host answers 404, the page says so in plain words, and one big
// button goes home.
import { expect, test } from '@playwright/test'
import { contrast } from '../fixtures/contrast.ts'
import { colours, SIZES, watchForTrouble } from './page.ts'

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('a missing page answers 404, says so, and offers the way home', async ({ page }) => {
      // The 404 itself is the one error this journey means to cause.
      const trouble = watchForTrouble(page, /404/)
      const response = await page.goto('/no-such-page')
      expect(response?.status()).toBe(404)
      await expect(page).toHaveTitle('Page not found: Automata Framework')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page does not exist.')
      await expect(page.getByText('The address may be mistyped, or the page may have moved.')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width)

      const home = page.getByRole('link', { name: 'Go to the home page', exact: true })
      expect(Math.round((await home.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44)
      const { words, ground } = await colours(page, '.btn')
      expect(contrast(words, ground)).toBeGreaterThanOrEqual(4.5)
      await home.click()
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coming soon.')
      expect(trouble()).toEqual([])
    })
  })
}
