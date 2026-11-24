// Counting visits, only with a yes (the Owner, 2026-11-24: "do not collect anything until after it is accepted").
// Nothing from outside the site is on the page as it is served. A first visit is asked once; "No", or no answer, adds
// nothing, ever. "Yes" adds Cloudflare's visitor counter (Web Analytics, which sets no cookies). The answer is kept on
// the device, and the footer changes it both ways. With no site token in the page, it asks and adds nothing at all.
import { deviceStore, readAnswer, type Store, writeAnswer } from './answer.ts'

const COUNTER = 'https://static.cloudflareinsights.com/beacon.min.js'

/**
 * The site token of the Web Analytics site for automataframework.com (made with Cloudflare's own setup off), from the
 * page's `automata-counter-token` meta. It is not a secret: the counter carries it in every page that has one. Anything
 * but 32 hex digits is no token.
 */
function counterToken(doc: Document): string | undefined {
  const token =
    doc.querySelector<HTMLMetaElement>('meta[name="automata-counter-token"]')?.content.trim() ?? ''
  return /^[0-9a-f]{32}$/.test(token) ? token : undefined
}

/** Adds the counter, once. Cloudflare's own copy reads its token from its own tag. */
function addCounter(doc: Document, token: string): void {
  if (doc.querySelector(`script[src="${COUNTER}"]`) !== null) return
  const script = doc.createElement('script')
  script.defer = true
  script.src = COUNTER
  script.dataset.cfBeacon = JSON.stringify({ token })
  doc.body.append(script)
}

/**
 * Stops a counter that is already running on this page. A script cannot be taken back once it has run, so the page
 * adds a rule of its own that lets it reach nothing but the site from now on: the counter's later reports are refused.
 */
function cutOff(doc: Document): void {
  if (doc.querySelector('meta[data-count-off]') !== null) return
  const rule = doc.createElement('meta')
  rule.httpEquiv = 'Content-Security-Policy'
  rule.content = "connect-src 'self' data: blob:"
  rule.dataset.countOff = ''
  doc.head.append(rule)
}

/** Shows the question on a first visit, wires its two buttons and the footer's, and adds the counter on a yes. */
export function startCounting(
  doc: Document,
  store: Store | undefined = doc.defaultView === null ? undefined : deviceStore(doc.defaultView),
): void {
  const token = counterToken(doc)
  // With no token there is nothing to count with: no question, no switch, nothing added. The page stays as served.
  if (token === undefined) return
  const ask = doc.querySelector<HTMLElement>('[data-ask]')
  const change = doc.querySelector<HTMLButtonElement>('button[data-count-change]')
  let answer = readAnswer(store)

  const show = (): void => {
    if (ask !== null) ask.hidden = answer !== undefined
    if (change === null) return
    change.hidden = false
    change.textContent = answer === 'yes' ? 'Stop counting my visits' : 'Count my visits'
  }
  const give = (given: 'yes' | 'no'): void => {
    const was = answer
    answer = given
    writeAnswer(store, given)
    if (given === 'yes') addCounter(doc, token)
    else if (was === 'yes') cutOff(doc)
    show()
  }

  if (answer === 'yes') addCounter(doc, token)
  show()
  for (const button of doc.querySelectorAll<HTMLButtonElement>('button[data-count]'))
    button.addEventListener('click', () => give(button.dataset.count === 'yes' ? 'yes' : 'no'))
  change?.addEventListener('click', () => give(answer === 'yes' ? 'no' : 'yes'))
}
