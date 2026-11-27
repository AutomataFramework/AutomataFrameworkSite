// A real SQLite database with the waitlist's migrations, behind the same few calls D1 offers, for the Node tests.
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { Db, Statement, Value } from '../../src/waitlist/db.ts'

const MIGRATIONS = new URL('../../migrations/', import.meta.url)

export function sqliteDb(): Db & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(MIGRATIONS).sort()) sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'))
  const statement = (sql: string, values: Value[]): Statement => ({
    bind: (...next) => statement(sql, next),
    first: async <Row>() => (sqlite.prepare(sql).get(...(values as SQLInputValue[])) ?? null) as Row | null,
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(values as SQLInputValue[])).changes) } }),
  })
  return { sqlite, prepare: (sql) => statement(sql, []) }
}
