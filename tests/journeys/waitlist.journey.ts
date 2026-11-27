// The waitlist, at every size, in every engine: a person adds their email and the editor they want first, confirms
// from the email, and can leave again. Against the live address (BASE_URL) only the reading journeys run: nothing posts
// a form there, since that would sign up a made-up address and send a real email.
import {
  expect,
  type Page,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestInfo,
  test,
} from '@playwright/test'
import { contrast } from '../fixtures/contrast.ts'
import { colours, SIZES, watchForTrouble } from './page.ts'
import { emailsTo, linksIn, rowOf } from './waitlist-stand-ins.ts'

const LIVE = process.env.BASE_URL !== undefined
/** A journey that posts a form. Never defined against the live address, so the live job cannot even list it. */
const posting = (
  title: string,
  body: (
    fixtures: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions,
    info: TestInfo,
  ) => Promise<void>,
): void => {
  if (!LIVE) test(title, body)
}
let count = 0
/** A new address for every journey, so none of them meets another's row. */
const newAddress = (name: string): string => `${name}-${Date.now()}-${count++}@example.com`

/** The email the mailer stand-in wrote for the address, once it is there. */
async function emailFor(address: string): Promise<string> {
  await expect.poll(() => emailsTo(address).length).toBe(1)
  return emailsTo(address)[0] ?? ''
}

async function join(page: Page, address: string, editor: RegExp | null): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Your email').fill(address)
  if (editor !== null) {
    // A person taps the card; the round dot inside it is there for screen readers and the keyboard.
    const choice = page.getByRole('radio', { name: editor })
    await page.locator('label.editor', { has: choice }).click()
    await expect(choice).toBeChecked()
  }
  await page.getByRole('button', { name: 'Add me to the list' }).click()
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('the form asks for an email and the first editor, plainly, with nothing too small or too faint', async ({
      page,
    }) => {
      const trouble = watchForTrouble(page)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 2 })).toHaveText('Be first in line.')
      const email = page.getByLabel('Your email')
      await expect(email).toHaveAttribute('type', 'email')
      await expect(email).toHaveAttribute('autocomplete', 'email')
      const group = page.getByRole('group', { name: 'Which editor do you want first?' })
      await expect(group.getByRole('radio')).toHaveCount(7)
      for (const name of ['Screens', 'World', 'Characters', 'Feel', 'Sound', 'Story', 'Not sure yet'])
        await expect(group.getByRole('radio', { name: new RegExp(`^${name}`) })).toBeAttached()

      // Big enough for a thumb.
      for (const target of [email, page.getByRole('button', { name: 'Add me to the list' })])
        expect(Math.round((await target.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44)
      for (const card of await page.locator('.editor').all()) {
        const box = await card.boundingBox()
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44)
        expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44)
      }
      // The hidden field is out of reach of people, screen readers, the keyboard and autofill.
      const trap = page.locator('input[name="website"]')
      await expect(trap).toHaveAttribute('tabindex', '-1')
      await expect(trap).toHaveAttribute('autocomplete', 'off')
      await expect(page.locator('.trap')).toHaveAttribute('aria-hidden', 'true')
      await expect(page.getByRole('textbox')).toHaveCount(1)

      // Every piece of words is easy to read on what is behind it (WCAG AA, 4.5 to 1).
      for (const selector of [
        '.join h2',
        '.join p',
        '.field',
        'legend',
        '.editor .name',
        '.editor .line',
        '.join .aside',
        '.join .btn',
      ]) {
        const { words, ground } = await colours(page, selector)
        expect(contrast(words, ground), selector).toBeGreaterThanOrEqual(4.5)
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width)
      expect(await page.locator('script').count()).toBe(0)
      expect(trouble()).toEqual([])
    })

    test('the privacy page says who keeps the email, what, why, where, for how long, and how to leave', async ({
      page,
    }) => {
      await page.goto('/')
      await page.getByRole('link', { name: 'How we keep your email' }).click()
      await expect(page).toHaveURL(/\/privacy\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('How we keep your email.')
      for (const heading of [
        'Who we are',
        'What we keep',
        'Why',
        'Where',
        'How long',
        'What we never do',
        'How to leave',
      ])
        await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible()
      await expect(page.getByText('Team Automata', { exact: false }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'hello@automataframework.com' })).toHaveAttribute(
        'href',
        'mailto:hello@automataframework.com',
      )
      await expect(page.getByText('we delete your address within 7')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width)
    })

    posting('join, confirm from the email, and leave again', async ({ page }) => {
      const trouble = watchForTrouble(page)
      const address = newAddress('join')
      await join(page, address, /^Feel/)
      await expect(page).toHaveURL(/\/waitlist\/check-email\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your email.')
      expect(rowOf(address)).toEqual({ editor: 'feel', status: 'waiting' })

      const { confirm, leave } = linksIn(await emailFor(address))
      await page.goto(confirm)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('One tap to join.')
      // Opening the link alone confirms nothing: mail scanners open links on their own.
      expect(rowOf(address)?.status).toBe('waiting')
      await page.getByRole('button', { name: 'Yes, add me' }).click()
      await expect(page).toHaveURL(/\/waitlist\/joined\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're on the list.")
      expect(rowOf(address)).toEqual({ editor: 'feel', status: 'joined' })

      // The same link a second time has done its job.
      await page.goto(confirm)
      await expect(page).toHaveURL(/\/waitlist\/link-expired\/$/)
      await page.getByRole('link', { name: 'Add my email again' }).click()
      await expect(page.getByLabel('Your email')).toBeVisible()

      await page.goto(leave)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Leave the list?')
      expect(rowOf(address)).toBeDefined()
      await page.getByRole('button', { name: 'Take me off the list' }).click()
      await expect(page).toHaveURL(/\/waitlist\/left\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're off the list.")
      expect(rowOf(address)).toBeUndefined()
      expect(trouble()).toEqual([])
    })

    posting(
      'join with the keyboard alone, with a ring you can see on every stop',
      async ({ page, browserName }) => {
        // WebKit's Tab skips links unless the person has turned that on, as Safari does.
        test.skip(browserName === 'webkit', 'Safari moves Tab to links only with Option held')
        const address = newAddress('keys')
        await page.goto('/')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await expect(page.getByLabel('Your email')).toBeFocused()
        await page.keyboard.type(address)
        await page.keyboard.press('Tab')
        const first = page.getByRole('radio', { name: /^Screens/ })
        await expect(first).toBeFocused()
        expect(
          await page
            .locator('.editor', { has: first })
            .evaluate((card) => getComputedStyle(card).outlineStyle),
        ).toBe('solid')
        await page.keyboard.press('ArrowRight')
        await page.keyboard.press('ArrowRight')
        await expect(page.getByRole('radio', { name: /^Characters/ })).toBeChecked()
        await page.keyboard.press('Tab')
        const button = page.getByRole('button', { name: 'Add me to the list' })
        await expect(button).toBeFocused()
        expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(/\/waitlist\/check-email\/$/)
        expect(rowOf(address)).toEqual({ editor: 'characters', status: 'waiting' })
      },
    )

    posting('no pick, or "Not sure yet", joins with no editor', async ({ page }) => {
      const none = newAddress('none')
      await join(page, none, null)
      await expect(page).toHaveURL(/\/waitlist\/check-email\/$/)
      expect(rowOf(none)).toEqual({ editor: '', status: 'waiting' })
      const unsure = newAddress('unsure')
      await join(page, unsure, /^Not sure yet/)
      await expect(page).toHaveURL(/\/waitlist\/check-email\/$/)
      expect(rowOf(unsure)).toEqual({ editor: '', status: 'waiting' })
    })

    posting(
      'an address the browser lets through but that cannot be one says what to fix',
      async ({ page }) => {
        // Browsers accept "name@host" with no dot; the site does not.
        await join(page, 'ada@example', null)
        await expect(page).toHaveURL(/\/waitlist\/try-again\/$/)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText("That email doesn't look right.")
        await expect(page.getByRole('alert')).toHaveText('Check it for a typo, like a missing @ or dot.')
        await page.getByRole('link', { name: 'Try again' }).click()
        await expect(page.getByLabel('Your email')).toBeVisible()
      },
    )
  })
}

posting(
  "a mail app's one-click unsubscribe takes the address off the list, even from the first of two emails",
  async ({ page, request }) => {
    const address = newAddress('oneclick')
    await join(page, address, /^Sound/)
    const { leave, confirm } = linksIn(await emailFor(address))
    await page.goto(confirm)
    await page.getByRole('button', { name: 'Yes, add me' }).click()
    expect(rowOf(address)?.status).toBe('joined')
    const token = new URL(leave).searchParams.get('t')
    const response = await request.post(`/api/waitlist/leave?t=${token}`, {
      form: { 'List-Unsubscribe': 'One-Click' },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(rowOf(address)).toBeUndefined()
  },
)

posting(
  'a filled hidden field stores nothing and sends nothing, and says the same as any other post',
  async ({ request }) => {
    const address = newAddress('bot')
    const response = await request.post('/api/waitlist', {
      form: { email: address, editor: 'world', website: 'https://spam.example' },
      maxRedirects: 0,
    })
    expect(response.headers().location).toBe('/waitlist/check-email/')
    expect(rowOf(address)).toBeUndefined()
    expect(emailsTo(address)).toEqual([])
  },
)

const POLICY =
  "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

posting(
  "the waitlist's pages and answers carry the safety headers, and keep their tokens to themselves",
  async ({ page, request }) => {
    const address = newAddress('headers')
    await join(page, address, null)
    const { confirm, leave } = linksIn(await emailFor(address))
    const answers = [
      await request.get(confirm),
      await request.get(leave),
      await request.post('/api/waitlist', { form: { email: 'x' }, maxRedirects: 0 }),
      await request.get('/waitlist/check-email/'),
    ]
    for (const response of answers) {
      const headers = response.headers()
      const where = response.url()
      expect(headers['content-security-policy'], where).toBe(POLICY)
      expect(headers['x-content-type-options'], where).toBe('nosniff')
      expect(headers['cache-control'], where).toBe('no-store')
      expect(headers['referrer-policy'], where).toBe('no-referrer')
      expect(headers['x-robots-tag'], where).toBe('noindex')
    }
  },
)
