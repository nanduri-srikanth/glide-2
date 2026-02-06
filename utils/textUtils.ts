/**
 * Text utilities for note processing
 */

const MAX_TITLE_LENGTH = 50;

/**
 * Generates a title from note content, Apple Notes style.
 * Uses the first line, or first sentence, or first N characters.
 *
 * @param content - The note content/transcript
 * @returns A title string (max ~50 chars)
 */
export function generateTitleFromContent(content: string): string {
  if (!content || content.trim().length === 0) {
    return '';
  }

  const trimmed = content.trim();

  // Strategy 1: Use first line if there's a line break
  const firstLineBreak = trimmed.indexOf('\n');
  if (firstLineBreak > 0 && firstLineBreak <= MAX_TITLE_LENGTH) {
    return trimmed.substring(0, firstLineBreak).trim();
  }

  // Strategy 2: Use first sentence if it ends within limit
  const sentenceEnders = /[.!?]/;
  const firstSentenceMatch = trimmed.match(sentenceEnders);
  if (firstSentenceMatch && firstSentenceMatch.index !== undefined) {
    const sentenceEnd = firstSentenceMatch.index + 1;
    if (sentenceEnd <= MAX_TITLE_LENGTH) {
      return trimmed.substring(0, sentenceEnd).trim();
    }
  }

  // Strategy 3: Truncate at word boundary
  if (trimmed.length <= MAX_TITLE_LENGTH) {
    return trimmed;
  }

  // Find last space before the limit to avoid cutting words
  const truncated = trimmed.substring(0, MAX_TITLE_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > MAX_TITLE_LENGTH * 0.6) {
    // Only use word boundary if it's not too far back
    return truncated.substring(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

/**
 * Checks if a title appears to be user-set vs auto-generated placeholder
 *
 * @param title - The current title
 * @returns true if the title seems to be user-set
 */
export function isUserSetTitle(title: string): boolean {
  if (!title) return false;

  const trimmed = title.trim().toLowerCase();

  // Common placeholder patterns that indicate auto-generated or empty
  const placeholders = [
    'untitled',
    'untitled note',
    'new note',
    'note',
    '',
  ];

  return !placeholders.includes(trimmed);
}

/**
 * Checks if title needs auto-generation
 *
 * @param title - Current title
 * @param content - Note content
 * @returns true if title should be auto-generated
 */
export function shouldAutoGenerateTitle(title: string, content: string): boolean {
  // Don't generate if no content
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Generate if title is empty or placeholder
  return !isUserSetTitle(title);
}
