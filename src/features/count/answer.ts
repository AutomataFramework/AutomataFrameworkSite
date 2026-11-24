// The visitor's answer about counting, kept on their own device. A browser may refuse storage (a private window,
// blocked site data); then the answer lasts only for this page, and no answer still means no.

/** The part of `localStorage` this needs, so a test can hand in its own. */
export type Store = Pick<Storage, 'getItem' | 'setItem'>

const KEY = 'automata.site.counting'

/** "yes" or "no" as kept, or undefined when there is none (or it cannot be read). */
export function readAnswer(store: Store | undefined): 'yes' | 'no' | undefined {
  try {
    const kept = store?.getItem(KEY)
    return kept === 'yes' || kept === 'no' ? kept : undefined
  } catch {
    return undefined
  }
}

/** Keeps the answer; a refusal is let pass, since the page already acts on it. */
export function writeAnswer(store: Store | undefined, answer: 'yes' | 'no'): void {
  try {
    store?.setItem(KEY, answer)
  } catch {
    // Kept for this page only.
  }
}

/** The page's `localStorage`, or undefined when even asking for it throws. */
export function deviceStore(win: Window): Store | undefined {
  try {
    return win.localStorage
  } catch {
    return undefined
  }
}
