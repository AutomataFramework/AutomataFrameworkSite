// `/favicon.ico`, for the browsers that cannot show `/icon.svg` and ask for this address on their own. An ICO file is a
// small table of contents followed by whole PNG files, which every browser that reads ICO has read since 2008.

/** One square PNG, as Chromium took it. */
export interface IconPng {
  readonly size: number
  readonly png: Buffer
}

const HEADER = 6
const ENTRY = 16

/** Packs square PNGs, smallest first, into one ICO file. */
export function packIco(pngs: readonly IconPng[]): Buffer {
  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 is an icon (2 would be a cursor)
  header.writeUInt16LE(pngs.length, 4)
  let offset = HEADER + ENTRY * pngs.length
  const entries = pngs.map(({ size, png }) => {
    if (size < 1 || size > 256) throw new RangeError(`An ICO picture is 1 to 256 px wide, not ${size}.`)
    const entry = Buffer.alloc(ENTRY)
    // 256 is written as 0: the field is one byte.
    entry.writeUInt8(size % 256, 0)
    entry.writeUInt8(size % 256, 1)
    entry.writeUInt8(0, 2) // no palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)])
}
