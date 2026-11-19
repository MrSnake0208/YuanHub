import { readFileSync } from 'node:fs'

// A lossless WebP may have ICC or EXIF metadata before its VP8L image chunk.
export function readLosslessWebp(path) {
  const bytes = readFileSync(path)
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32LE(offset + 4)
      if (offset + 8 + size > bytes.length) break
      if (bytes.toString('ascii', offset, offset + 4) === 'VP8L' && size >= 5 && bytes[offset + 8] === 0x2f) {
        const header = bytes.readUInt32LE(offset + 9)
        return { width: (header & 0x3fff) + 1, height: ((header >>> 14) & 0x3fff) + 1, alpha: Boolean(header & 0x10000000) }
      }
      offset += 8 + size + (size % 2)
    }
  }
  throw new Error(`Expected lossless WebP at ${path}`)
}
