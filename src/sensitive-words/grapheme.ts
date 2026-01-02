const ZW = '\u200B'

let segmenter: Intl.Segmenter | null = null

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter) return segmenter
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return segmenter
}

export function graphemes(s: string): string[] {
  const seg = getSegmenter()
  if (seg) {
    return Array.from(seg.segment(s), (x) => x.segment)
  }
  return Array.from(s)
}

export function graphemeLength(s: string): number {
  const seg = getSegmenter()
  if (seg) {
    let count = 0
    for (const _ of seg.segment(s)) count++
    return count
  }
  return Array.from(s).length
}

export function containsZW(s: string): boolean {
  return s.includes(ZW)
}

export { ZW }
