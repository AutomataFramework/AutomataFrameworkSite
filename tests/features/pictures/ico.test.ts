import { expect, test } from 'vitest'
import { packIco } from '../../../src/features/pictures/ico.ts'

const png = (fill: number, length: number): Buffer => Buffer.alloc(length, fill)

test('the table of contents names each picture, its size and where its bytes are', () => {
  const pictures = [
    { size: 16, png: png(1, 10) },
    { size: 32, png: png(2, 20) },
    { size: 256, png: png(3, 5) },
  ]
  const ico = packIco(pictures)
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3])
  const entries = pictures.map((_, i) => {
    const at = 6 + 16 * i
    return {
      width: ico.readUInt8(at),
      height: ico.readUInt8(at + 1),
      bits: ico.readUInt16LE(at + 6),
      length: ico.readUInt32LE(at + 8),
      offset: ico.readUInt32LE(at + 12),
    }
  })
  // 256 is written as 0, because the field is one byte.
  expect(entries.map((entry) => entry.width)).toEqual([16, 32, 0])
  expect(entries.map((entry) => entry.height)).toEqual([16, 32, 0])
  expect(entries.every((entry) => entry.bits === 32)).toBe(true)
  // Each picture's bytes come back whole from where its entry says they are.
  pictures.forEach((picture, i) => {
    const entry = entries[i]
    if (entry === undefined) throw new Error('missing entry')
    expect(ico.subarray(entry.offset, entry.offset + entry.length)).toEqual(picture.png)
  })
  expect(ico.length).toBe(6 + 16 * 3 + 35)
})

test('a picture wider than an ICO can say is refused', () => {
  expect(() => packIco([{ size: 512, png: png(0, 1) }])).toThrow('1 to 256 px')
})
