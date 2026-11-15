// TEMPORARY, deleted before this branch is marked ready. It exists to find why `.hero .tag` sometimes does not come to
// rest in Firefox (motion.journey.ts "the first screen arrives once and ends fully shown", phone, real game only).
// Each variant loads the page the way that journey does (a fresh page, motion on, a phone) and waits for `.tag` to be
// at rest; the variants differ only in one line of CSS appended to the site's stylesheet by the route. A variant that
// never fails where the control does is the cause, shown.
import { expect, test } from '@playwright/test'

const AT_REST = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/

/** What each variant appends to the site's own stylesheet. The control appends nothing. */
const VARIANTS = {
  control: '',
  // `.tag` is an `a`, and `a` transitions `transform`: the only element that is both animated and transitioned on it.
  'no-transform-transition': '.tag{transition-property:filter,text-decoration-thickness}',
  // The animation's end is the page's own value, not "whatever is underneath".
  'explicit-to': '@keyframes arrive{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
  // The animation stops holding its end once it ends.
  'fill-backwards': '.tag{animation-fill-mode:backwards}',
} as const

const ROUNDS = 40

test.describe('arrive diagnosis', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' })
  test.skip(({ browserName }) => browserName !== 'firefox', 'only Firefox shows it')

  for (let round = 0; round < ROUNDS; round++) {
    for (const [name, css] of Object.entries(VARIANTS)) {
      test(`${name} #${round}`, async ({ page }) => {
        await page.addInitScript(() => {
          const log: string[] = []
          Object.assign(window, { __log: log })
          const note = (what: string): void => {
            log.push(`${Math.round(performance.now())} ${what}`)
          }
          for (const type of [
            'transitionrun',
            'transitionstart',
            'transitionend',
            'transitioncancel',
            'animationstart',
            'animationend',
            'animationcancel',
          ]) {
            document.addEventListener(
              type,
              (event) => {
                if (!(event.target instanceof Element) || !event.target.classList.contains('tag')) return
                const detail = event as TransitionEvent & AnimationEvent
                note(`${type} ${detail.propertyName || detail.animationName} at ${detail.elapsedTime}`)
              },
              true,
            )
          }
          document.addEventListener('DOMContentLoaded', () => note('DOMContentLoaded'))
          window.addEventListener('load', () => note('load'))
          new MutationObserver(() => note(`html class="${document.documentElement.className}"`)).observe(
            document.documentElement,
            { attributes: true, attributeFilter: ['class'] },
          )
        })
        if (css !== '') {
          await page.route('**/*.css', async (route) => {
            const response = await route.fetch()
            const body = await response.text()
            const mine = !new URL(route.request().url()).pathname.startsWith('/play/')
            await route.fulfill({ response, body: mine ? `${body}\n${css}` : body })
          })
        }
        await page.goto('/')
        const read = (): Promise<{ opacity: string; transform: string }> =>
          page.locator('.hero .tag').evaluate((element) => {
            const s = getComputedStyle(element)
            return { opacity: s.opacity, transform: s.transform }
          })
        try {
          await expect
            .poll(read, { timeout: 3_000 })
            .toEqual({ opacity: '1', transform: expect.stringMatching(AT_REST) })
        } catch (error) {
          const after = await page.evaluate(() => {
            const tag = document.querySelector('.hero .tag')
            if (!(tag instanceof HTMLElement)) return { missing: true }
            const now = getComputedStyle(tag).transform
            const animations = tag.getAnimations().map((a) => {
              const kind = a.constructor.name
              const what = 'transitionProperty' in a ? a.transitionProperty : (a as CSSAnimation).animationName
              return `${kind} ${what} ${a.playState} t=${a.currentTime} pending=${a.pending}`
            })
            // Does a restyle of the element alone put it at rest?
            tag.style.outline = '0 solid transparent'
            const afterRestyle = getComputedStyle(tag).transform
            tag.style.outline = ''
            return { now, animations, afterRestyle }
          })
          const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log)
          throw new Error(`${name} #${round} stuck: ${JSON.stringify(after)}\n${log.join('\n')}\n${error}`)
        }
      })
    }
  }
})
