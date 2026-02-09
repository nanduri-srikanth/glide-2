/**
 * Math Parser — splits text into segments of plain text, inline math, and block math.
 *
 * Inline math:  $...$   (single dollar signs, not preceded/followed by space+$)
 * Block math:   $$...$$ (double dollar signs on their own or inline)
 */

export type MathSegmentType = 'text' | 'inline-math' | 'block-math';

export interface MathSegment {
  type: MathSegmentType;
  content: string; // raw text (for math types, the LaTeX source without delimiters)
}

/**
 * Parse a string into an array of MathSegments.
 *
 * Rules:
 *  1. `$$...$$` is block math (greedy-minimal: matches the shortest `$$` pair).
 *  2. `$...$` is inline math (content must not start or end with a space,
 *     and must not be empty).
 *  3. Everything else is plain text.
 */
export function parseMathSpans(input: string): MathSegment[] {
  if (!input) return [];

  const segments: MathSegment[] = [];
  // Combined regex: block math first ($$...$$), then inline ($...$)
  // Block: non-greedy match between $$
  // Inline: non-greedy match between $, content must not be empty or start/end with space
  const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^\s$][^$]*?[^\s$])\$|\$([^\s$])\$/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(input)) !== null) {
    // Push preceding text
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: input.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      // Block math ($$...$$)
      segments.push({ type: 'block-math', content: match[1].trim() });
    } else {
      // Inline math ($...$) — match[2] is multi-char, match[3] is single-char
      const latex = match[2] !== undefined ? match[2] : match[3];
      segments.push({ type: 'inline-math', content: latex });
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < input.length) {
    segments.push({ type: 'text', content: input.slice(lastIndex) });
  }

  return segments;
}

/**
 * Quick check: does the text contain any math delimiters?
 */
export function containsMath(input: string): boolean {
  if (!input) return false;
  return /\$[^$]/.test(input);
}
