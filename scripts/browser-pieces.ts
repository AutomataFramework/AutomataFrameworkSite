// The part of `gate` that names a failing engine. Each browser piece runs its share of every engine and leaves one file,
// `piece-<n>.txt`, with a line `<engine> passed` or `<engine> failed` for each engine it ran. This reads those files and
// says, for every piece and every engine the run asked for, whether it passed, so a red run says "webkit failed in
// piece 3/6" rather than only "browsers failed".
//
// This file has no dependencies on purpose: the workflow runs it with Node alone.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** How many pieces the browser tests run in (`browsers (1/6)` to `6/6`): the Settings' browser test pieces. */
export const PIECES = 6

/** What the check says, and the lines that make it readable in the log. */
export type Verdict = {
  readonly ok: boolean
  readonly lines: readonly string[]
  readonly failures: readonly string[]
}

/**
 * Judges the pieces' files. `files` maps a piece's number to its file's text (a piece that left no file is absent);
 * `engines` are the engines this run asked for. Passes only when every piece has a `passed` (or, on a draft, `none`) line for every engine.
 */
export function judge(files: ReadonlyMap<number, string>, engines: readonly string[]): Verdict {
  const lines: string[] = []
  const failures: string[] = []
  for (let piece = 1; piece <= PIECES; piece += 1) {
    const results = new Map<string, string>()
    for (const line of (files.get(piece) ?? '').split('\n')) {
      const [engine, result] = line.trim().split(/\s+/)
      if (engine && result) results.set(engine, result)
    }
    for (const engine of engines) {
      const result = results.get(engine)
      // `none`: a draft whose change reaches no browser test this piece was given. `browser-fill.ts check` proves every
      // file the change reaches ran in some piece, so a piece with none hides nothing.
      const good = result === 'passed' || result === 'none'
      const what =
        result === 'passed'
          ? `${engine} passed in piece ${piece}/${PIECES}`
          : result === 'none'
            ? `${engine} had no test the change reaches in piece ${piece}/${PIECES}`
            : result === 'failed'
              ? `${engine} failed in piece ${piece}/${PIECES}`
              : `${engine} has no result in piece ${piece}/${PIECES} (the piece was cancelled or did not run)`
      lines.push(`${good ? 'ok ' : 'NO '} ${what}`)
      if (!good) failures.push(what)
    }
  }
  return { ok: engines.length > 0 && failures.length === 0, lines, failures }
}

/** Reads the folder the pieces' files were downloaded to. */
export function readPieces(folder: string): Map<number, string> {
  const files = new Map<number, string>()
  for (let piece = 1; piece <= PIECES; piece += 1) {
    const path = join(folder, `piece-${piece}.txt`)
    if (existsSync(path)) files.set(piece, readFileSync(path, 'utf8'))
  }
  return files
}

function main(): void {
  const folder = process.argv[2]
  const engines = JSON.parse(process.env.ENGINES ?? '[]') as unknown
  if (!folder || !Array.isArray(engines) || !engines.every((engine) => typeof engine === 'string')) {
    throw new Error('Give the results folder as the argument, and ENGINES as a JSON list of engine names.')
  }
  const verdict = judge(readPieces(folder), engines)
  for (const line of verdict.lines) console.log(line)
  if (!verdict.ok) {
    const summary = process.env.GITHUB_STEP_SUMMARY
    const text = verdict.failures.map((failure) => `- ${failure}`).join('\n')
    if (summary) appendFileSync(summary, `### Browser tests\n\n${text || '- no engine was asked for'}\n`)
    console.error(`Every engine must pass in every piece, and these did not:\n${text}`)
    process.exitCode = 1
  }
}

// Run only when started from the command line, not when a test imports the checks above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
