/**
 * Word-level diff utilities for inline display.
 */

export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/**
 * Computes a word-level diff between two strings using LCS.
 * Returns an array of segments with type 'equal', 'added', or 'removed'.
 *
 * @param oldText - The original text
 * @param newText - The updated text
 * @returns Array of diff segments
 */
export function computeWordDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/\s+/).filter(Boolean);
  const newWords = newText.split(/\s+/).filter(Boolean);

  // Build LCS table
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build raw diff
  const raw: Array<{ type: DiffSegment['type']; word: string }> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      raw.unshift({ type: 'equal', word: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'added', word: newWords[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'removed', word: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive segments of the same type
  const segments: DiffSegment[] = [];
  for (const item of raw) {
    const last = segments[segments.length - 1];
    if (last && last.type === item.type) {
      last.text += ' ' + item.word;
    } else {
      segments.push({ type: item.type, text: item.word });
    }
  }

  return segments;
}
