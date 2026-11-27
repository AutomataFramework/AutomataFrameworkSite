// The two wrangler.toml files, read as text: the mailer has no address of its own, and both use the same database.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { SENDER } from '../../src/waitlist/message.ts'

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const site = read('wrangler.toml')
const mailer = read('mailer/wrangler.toml')
const value = (toml: string, key: string): string[] =>
  [...toml.matchAll(new RegExp(`^${key} = "([^"]*)"$`, 'gm'))].map((match) => match[1] ?? '')

test('the mailer can be reached only through the service binding', () => {
  expect(mailer).toMatch(/^workers_dev = false$/m)
  expect(mailer).toMatch(/^preview_urls = false$/m)
  expect(mailer).not.toMatch(/^routes?\s*=/m)
  expect(mailer).not.toMatch(/^\[\[routes\]\]/m)
  expect(value(site, 'service')).toEqual(value(mailer, 'name').slice(0, 1))
})

test('the mailer sends only from the one sender address', () => {
  expect(mailer).toContain(`allowed_sender_addresses = ["${SENDER}"]`)
})

test('the clean-up runs just after each UTC midnight', () => {
  expect(mailer).toContain('crons = ["5 0 * * *"]')
})

test('the site and the mailer use the same database, and the mailer holds no secret', () => {
  expect(value(mailer, 'database_name')).toEqual(value(site, 'database_name'))
  expect(value(mailer, 'database_id')).toEqual(value(site, 'database_id'))
  expect(mailer).not.toContain('WAITLIST_SECRET')
})
