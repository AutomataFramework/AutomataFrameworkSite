// The coming-soon page, at every size, in every engine: a person arrives, reads what it is, and can reach the font
// licences. Nothing on it is broken, blocked by the safety header, too faint to read or wider than the screen.
import { expect, test } from '@playwright/test'
import { contrast } from '../fixtures/contrast.ts'
import { colours, SIZES, watchForTrouble } from './page.ts'

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('the page says what Automata Framework is, and that it is coming soon', async ({ page }) => {
      const trouble = watchForTrouble(page)
      const response = await page.goto('/')
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle('Automata Framework: coming soon')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coming soon.')
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(
        page.getByText(
          'Automata Framework is a simple way to make games that play in a web browser. We are building it now.',
        ),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Automata Framework, home' })).toHaveAttribute('href', '/')

      // Both fonts arrived: the safety header lets the site's own font files through.
      await page.evaluate(() => document.fonts.ready)
      expect(await page.evaluate(() => document.fonts.check('500 48px "Fraunces Variable"'))).toBe(true)
      expect(await page.evaluate(() => document.fonts.check('400 18px "Onest Variable"'))).toBe(true)

      // Nothing is wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width)

      // Every piece of words is easy to read on the ground (WCAG AA, 4.5 to 1).
      for (const selector of ['h1', 'main p', '.wordmark', 'footer a']) {
        const { words, ground } = await colours(page, selector)
        expect(contrast(words, ground), selector).toBeGreaterThanOrEqual(4.5)
      }
      expect(trouble()).toEqual([])
    })

    test('the keyboard reaches every link and field, with a ring you can see', async ({
      page,
      browserName,
    }) => {
      // WebKit's Tab skips links unless the person has turned that on, as Safari does.
      test.skip(browserName === 'webkit', 'Safari moves Tab to links only with Option held')
      await page.goto('/')
      await page.keyboard.press('Tab')
      const wordmark = page.getByRole('link', { name: 'Automata Framework, home' })
      await expect(wordmark).toBeFocused()
      expect(await wordmark.evaluate((link) => getComputedStyle(link).outlineStyle)).toBe('solid')
      // Then the waitlist's field, one stop for the choices, the button and the links, to the last link, each with a
      // ring (a choice's ring is drawn on its card).
      const licences = page.getByRole('link', { name: 'Font licences' })
      for (
        let stop = 0;
        stop < 8 && !(await licences.evaluate((link) => link === document.activeElement));
        stop++
      ) {
        await page.keyboard.press('Tab')
        const ring = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement
          return getComputedStyle(focused.closest('.editor') ?? focused).outlineStyle
        })
        expect(ring).toBe('solid')
      }
      await expect(licences).toBeFocused()
    })

    test('the font licences link opens the licence notices', async ({ page }) => {
      await page.goto('/')
      const link = page.getByRole('link', { name: 'Font licences' })
      expect(Math.round((await link.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44)
      await link.click()
      await expect(page).toHaveURL(/\/licences\.txt$/)
      await expect(page.getByText('Copyright 2020 The Fraunces Project Authors')).toBeVisible()
    })
  })
}
