import { expect, test } from 'vitest'
import { readAnswer, type Store, writeAnswer } from '#src/features/count/answer.ts'

/** A store that keeps what it is given, like a device's. */
const kept = (): Store & { items: Map<string, string> } => {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

/** A store that refuses everything, like a private window with site data blocked. */
const refusing: Store = {
  getItem: () => {
    throw new Error('refused')
  },
  setItem: () => {
    throw new Error('refused')
  },
}

test('an answer given is the answer read back', () => {
  const store = kept()
  for (const answer of ['yes', 'no', 'yes'] as const) {
    writeAnswer(store, answer)
    expect(readAnswer(store)).toBe(answer)
  }
})

test('no answer, or anything else kept under its name, is no answer', () => {
  const store = kept()
  expect(readAnswer(store)).toBeUndefined()
  for (const odd of ['', 'Yes', 'true', '1', 'yes ']) {
    store.items.set('automata.site.counting', odd)
    expect(readAnswer(store), odd).toBeUndefined()
  }
})

test('a device that refuses storage, or has none, gives no answer and throws nothing', () => {
  expect(readAnswer(refusing)).toBeUndefined()
  expect(() => writeAnswer(refusing, 'yes')).not.toThrow()
  expect(readAnswer(undefined)).toBeUndefined()
  expect(() => writeAnswer(undefined, 'no')).not.toThrow()
})
