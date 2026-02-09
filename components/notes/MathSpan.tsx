import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { NotesColors } from '@/constants/theme';
import { latexToUnicode, isSimpleMath } from '@/lib/math';
import type { MathSegmentType } from '@/lib/math';

interface MathSpanProps {
  latex: string;
  type: MathSegmentType;
}

/**
 * Renders a math expression.
 *
 * - Simple expressions (subscripts, superscripts, Greek letters, etc.) are
 *   converted to Unicode and rendered as styled inline text.
 * - Complex expressions (matrices, multi-line) are shown as styled LaTeX source.
 */
export function MathSpan({ latex, type }: MathSpanProps) {
  const simple = isSimpleMath(latex);
  const { text, converted } = simple ? latexToUnicode(latex) : { text: latex, converted: false };

  if (type === 'block-math') {
    return (
      <View style={styles.blockContainer}>
        <Text style={[styles.blockText, !converted && styles.latexSource]}>
          {text}
        </Text>
      </View>
    );
  }

  // Inline math
  return (
    <Text style={[styles.inlineText, !converted && styles.latexSource]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  blockContainer: {
    backgroundColor: 'rgba(98, 69, 135, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 8,
    alignItems: 'center',
  },
  blockText: {
    fontSize: 18,
    lineHeight: 28,
    color: NotesColors.textPrimary,
  },
  inlineText: {
    fontSize: 16,
    color: NotesColors.textPrimary,
  },
  latexSource: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: 'rgba(98, 69, 135, 0.9)',
  },
});

export default MathSpan;
