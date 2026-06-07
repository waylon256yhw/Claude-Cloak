const ZW = '\u200B'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export interface GraphemeSegment {
  segment: string
  index: number
}

export function segmentGraphemes(s: string): GraphemeSegment[] {
  return Array.from(segmenter.segment(s), (x) => ({ segment: x.segment, index: x.index }))
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
