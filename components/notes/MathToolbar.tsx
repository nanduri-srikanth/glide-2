/**
 * MathToolbar - Quick-insert toolbar for common math symbols and templates.
 *
 * Renders a scrollable row of math tokens. Tapping a token calls `onInsert`
 * with the LaTeX string to inject at the cursor.
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Text,
} from 'react-native';
import { NotesColors } from '@/constants/theme';

interface MathToolbarProps {
  onInsert: (latex: string) => void;
}

type MathToken = { label: string; insert: string };

const CATEGORIES: { title: string; tokens: MathToken[] }[] = [
  {
    title: 'Common',
    tokens: [
      { label: '$…$', insert: '$$' },        // Wrap cursor in inline math
      { label: '$$…$$', insert: '$$\n\n$$' }, // Block math template
      { label: 'x²', insert: '^2' },
      { label: 'xₙ', insert: '_n' },
      { label: '½', insert: '\\frac{}{} ' },
      { label: '√', insert: '\\sqrt{} ' },
      { label: '±', insert: '\\pm ' },
      { label: '≈', insert: '\\approx ' },
      { label: '≠', insert: '\\neq ' },
      { label: '≤', insert: '\\leq ' },
      { label: '≥', insert: '\\geq ' },
      { label: '×', insert: '\\times ' },
      { label: '÷', insert: '\\div ' },
      { label: '·', insert: '\\cdot ' },
      { label: '∞', insert: '\\infty ' },
    ],
  },
  {
    title: 'Greek',
    tokens: [
      { label: 'α', insert: '\\alpha ' },
      { label: 'β', insert: '\\beta ' },
      { label: 'γ', insert: '\\gamma ' },
      { label: 'δ', insert: '\\delta ' },
      { label: 'ε', insert: '\\epsilon ' },
      { label: 'θ', insert: '\\theta ' },
      { label: 'λ', insert: '\\lambda ' },
      { label: 'μ', insert: '\\mu ' },
      { label: 'π', insert: '\\pi ' },
      { label: 'σ', insert: '\\sigma ' },
      { label: 'φ', insert: '\\phi ' },
      { label: 'ω', insert: '\\omega ' },
      { label: 'Δ', insert: '\\Delta ' },
      { label: 'Σ', insert: '\\Sigma ' },
      { label: 'Ω', insert: '\\Omega ' },
    ],
  },
  {
    title: 'Physics',
    tokens: [
      { label: 'v₀', insert: 'v_0' },
      { label: 'v₀ₓ', insert: 'v_{0x}' },
      { label: 'v₀ᵧ', insert: 'v_{0y}' },
      { label: 'F=ma', insert: 'F = ma' },
      { label: '∂', insert: '\\partial ' },
      { label: '∇', insert: '\\nabla ' },
      { label: '∫', insert: '\\int ' },
      { label: '∑', insert: '\\sum ' },
      { label: '→', insert: '\\rightarrow ' },
      { label: '⟨⟩', insert: '\\langle \\rangle ' },
      { label: '°', insert: '\\degree ' },
      { label: '∠', insert: '\\angle ' },
      { label: '⊥', insert: '\\perp ' },
    ],
  },
];

export function MathToolbar({ onInsert }: MathToolbarProps) {
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <View style={styles.container}>
      {/* Category tabs */}
      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat, i) => (
          <TouchableOpacity
            key={cat.title}
            style={[styles.categoryTab, i === activeCategory && styles.categoryTabActive]}
            onPress={() => setActiveCategory(i)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryText, i === activeCategory && styles.categoryTextActive]}>
              {cat.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Token buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tokenRow}
        keyboardShouldPersistTaps="always"
      >
        {CATEGORIES[activeCategory].tokens.map((token, i) => (
          <TouchableOpacity
            key={`${activeCategory}-${i}`}
            style={styles.tokenButton}
            onPress={() => onInsert(token.insert)}
            activeOpacity={0.6}
          >
            <Text style={styles.tokenLabel}>{token.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: NotesColors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingBottom: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 4,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  categoryTabActive: {
    backgroundColor: 'rgba(139, 133, 208, 0.2)',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
    color: NotesColors.textSecondary,
  },
  categoryTextActive: {
    color: NotesColors.primary,
    fontWeight: '600',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  tokenButton: {
    minWidth: 40,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    paddingHorizontal: 10,
  },
  tokenLabel: {
    fontSize: 16,
    color: NotesColors.textPrimary,
  },
});

export default MathToolbar;
