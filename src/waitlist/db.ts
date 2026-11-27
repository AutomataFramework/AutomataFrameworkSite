// The part of Cloudflare D1 the waitlist uses, so the logic runs against D1 on Cloudflare and SQLite in tests alike.

export type Value = string | number | null

export interface Statement {
  bind(...values: Value[]): Statement
  first<Row = Record<string, Value>>(): Promise<Row | null>
  run(): Promise<{ meta: { changes: number } }>
}

export interface Db {
  prepare(sql: string): Statement
}
