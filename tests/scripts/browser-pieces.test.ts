import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { judge, PIECES, readPieces } from '../../scripts/browser-pieces.ts'

const ALL = ['chromium', 'webkit', 'firefox']
/** Every piece's file, each engine `passed` unless `failed` names it as `<engine> <piece>`. */
const files = (engines: readonly string[], failed: readonly string[] = []): Map<number, string> =>
  new Map(
    Array.from({ length: PIECES }, (_, index) => {
      const piece = index + 1
      const text = engines
        .map((engine) => `${engine} ${failed.includes(`${engine} ${piece}`) ? 'failed' : 'passed'}`)
        .join('\n')
      return [piece, `${text}\n`]
    }),
  )

describe('judge: every engine must pass in every piece', () => {
  test('the browser tests are six pieces, the number `ci.yml` runs', () => {
    expect(PIECES).toBe(6)
  })

  test('passes when every engine passed in every piece, with one line for each', () => {
    const verdict = judge(files(ALL), ALL)
    expect(verdict.ok).toBe(true)
    expect(verdict.lines).toHaveLength(18)
    expect(verdict.lines[0]).toBe('ok  chromium passed in piece 1/6')
  })

  test('names the engine and the piece that failed', () => {
    const verdict = judge(files(ALL, ['webkit 3']), ALL)
    expect(verdict.ok).toBe(false)
    expect(verdict.failures).toEqual(['webkit failed in piece 3/6'])
  })

  test('fails when a piece left no file, naming every engine it owed', () => {
    const some = files(ALL)
    some.delete(4)
    const verdict = judge(some, ALL)
    expect(verdict.ok).toBe(false)
    expect(verdict.failures).toEqual(
      ALL.map((engine) => `${engine} has no result in piece 4/6 (the piece was cancelled or did not run)`),
    )
  })

  test('fails when a piece ran fewer engines than the run asked for', () => {
    const verdict = judge(files(['chromium', 'webkit']), ALL)
    expect(verdict.ok).toBe(false)
    expect(verdict.failures).toHaveLength(PIECES)
  })

  test('a draft asks for Chromium alone, and is judged by it alone', () => {
    expect(judge(files(['chromium']), ['chromium']).ok).toBe(true)
  })

  test('an empty list of engines never passes', () => {
    expect(judge(files(ALL), []).ok).toBe(false)
  })
})

describe('the command, as `gate` runs it', () => {
  const script = new URL('../../scripts/browser-pieces.ts', import.meta.url).pathname
  const run = (folder: string, engines: string): { code: number; out: string } => {
    try {
      const out = execFileSync('node', [script, folder], {
        env: { ...process.env, ENGINES: engines },
        stdio: 'pipe',
      })
      return { code: 0, out: out.toString() }
    } catch (error) {
      const failed = error as { status: number; stdout: Buffer; stderr: Buffer }
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` }
    }
  }
  const folder = (contents: Map<number, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'pieces-'))
    for (const [piece, text] of contents) writeFileSync(join(dir, `piece-${piece}.txt`), text)
    return dir
  }

  test('reads the files the pieces left', () => {
    expect(readPieces(folder(files(ALL))).size).toBe(PIECES)
  })

  test('exits 0 when everything passed', () => {
    expect(run(folder(files(ALL)), JSON.stringify(ALL)).code).toBe(0)
  })

  test('exits 1 and names the failing engine', () => {
    const result = run(folder(files(ALL, ['firefox 6'])), JSON.stringify(ALL))
    expect(result.code).toBe(1)
    expect(result.out).toContain('firefox failed in piece 6/6')
  })

  test('exits 1 when no piece left a file', () => {
    expect(run(folder(new Map()), JSON.stringify(ALL)).code).toBe(1)
  })
})
