const ZW = '\u200B'

let segmenter: Intl.Segmenter | null = null

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter) return segmenter
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return segmenter
}

export interface GraphemeSegment {
  segment: string
  index: number
}

export function segmentGraphemes(s: string): GraphemeSegment[] {
  const seg = getSegmenter()
  if (seg) {
    return Array.from(seg.segment(s), (x) => ({ segment: x.segment, index: x.index }))
  }
  const chars = Array.from(s)
  let idx = 0
  return chars.map((segment) => {
    const current = { segment, index: idx }
    idx += segment.length
    return current
  })
}

export function graphemes(s: string): string[] {
  return segmentGraphemes(s).map((x) => x.segment)
}

export function graphemeLength(s: string): number {
  return segmentGraphemes(s).length
}

export function containsZW(s: string): boolean {
  return s.includes(ZW)
}

export { ZW }
