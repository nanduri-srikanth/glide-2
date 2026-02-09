/**
 * LaTeX-to-Unicode converter for common math patterns.
 *
 * Converts simple LaTeX expressions to their Unicode equivalents so they
 * render beautifully as plain text (no special renderer needed).
 *
 * Covers ~80 % of physics/math note-taking needs:
 *   subscripts, superscripts, Greek letters, common operators,
 *   simple fractions, arrows, and comparison operators.
 */

// ── Greek letters ──────────────────────────────────────────────────────

const GREEK: Record<string, string> = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
  '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
  '\\theta': 'θ', '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ',
  '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
  '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ',
  '\\psi': 'ψ', '\\omega': 'ω',
  // Uppercase
  '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
  '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Phi': 'Φ',
  '\\Psi': 'Ψ', '\\Omega': 'Ω',
};

// ── Subscript / Superscript digit maps ─────────────────────────────────

const SUB_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

const SUP_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
  'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
  'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
  'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
};

// ── Common operators & symbols ─────────────────────────────────────────

const SYMBOLS: Record<string, string> = {
  '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\pm': '±', '\\mp': '∓',
  '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
  '\\equiv': '≡', '\\propto': '∝', '\\sim': '∼',
  '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
  '\\sum': '∑', '\\prod': '∏', '\\int': '∫',
  '\\sqrt': '√',
  '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
  '\\to': '→',
  '\\hat': '\u0302',   // combining circumflex (applied after char)
  '\\vec': '\u20D7',   // combining arrow above
  '\\dot': '\u0307',   // combining dot above
  '\\ddot': '\u0308',  // combining diaeresis
  '\\bar': '\u0304',   // combining macron
  '\\tilde': '\u0303', // combining tilde
  '\\degree': '°', '\\deg': '°',
  '\\angle': '∠',
  '\\perp': '⊥', '\\parallel': '∥',
  '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
  '\\cup': '∪', '\\cap': '∩',
  '\\forall': '∀', '\\exists': '∃',
  '\\ldots': '…', '\\cdots': '⋯',
  '\\langle': '⟨', '\\rangle': '⟩',
};

// ── Simple fractions ───────────────────────────────────────────────────

const FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
  '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
  '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛',
  '3/8': '⅜', '5/8': '⅝', '7/8': '⅞', '1/9': '⅑', '1/10': '⅒',
};

// ── Trig / common function names ───────────────────────────────────────

const FUNCTIONS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'lim', 'max', 'min', 'det',
];

// ── Helpers ────────────────────────────────────────────────────────────

function toSubscript(s: string): string {
  return s.split('').map(c => SUB_DIGITS[c] ?? c).join('');
}

function toSuperscript(s: string): string {
  return s.split('').map(c => SUP_DIGITS[c] ?? c).join('');
}

/**
 * Convert a single LaTeX expression to Unicode text.
 * Returns the converted string, or the original if conversion is not possible.
 */
export function latexToUnicode(latex: string): { text: string; converted: boolean } {
  let result = latex.trim();
  let changed = false;

  // Replace Greek letters (longest match first to avoid partial matches)
  const greekKeys = Object.keys(GREEK).sort((a, b) => b.length - a.length);
  for (const key of greekKeys) {
    if (result.includes(key)) {
      result = result.split(key).join(GREEK[key]);
      changed = true;
    }
  }

  // Replace symbols (longest match first)
  const symbolKeys = Object.keys(SYMBOLS).sort((a, b) => b.length - a.length);
  for (const key of symbolKeys) {
    // Diacritics (\hat, \vec, \dot, etc.) need special handling — apply AFTER the next char
    if (['\\hat', '\\vec', '\\dot', '\\ddot', '\\bar', '\\tilde'].includes(key)) {
      // \hat{x} or \hat x → x + combining char
      const diacriticRe = new RegExp(
        key.replace('\\', '\\\\') + '\\{?([a-zA-Z])\\}?',
        'g'
      );
      if (diacriticRe.test(result)) {
        result = result.replace(diacriticRe, (_m, ch) => ch + SYMBOLS[key]);
        changed = true;
      }
    } else if (result.includes(key)) {
      result = result.split(key).join(SYMBOLS[key]);
      changed = true;
    }
  }

  // \sqrt{...} → √(...)
  result = result.replace(/\\sqrt\{([^}]+)\}/g, (_m, inner) => {
    changed = true;
    return '√(' + inner + ')';
  });

  // \frac{a}{b} → a/b or Unicode fraction
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_m, num, den) => {
    changed = true;
    const key = `${num}/${den}`;
    if (FRACTIONS[key]) return FRACTIONS[key];
    return `${num}⁄${den}`; // fraction slash U+2044
  });

  // Simple fractions without \frac: e.g., standalone 1/2
  for (const [frac, unicode] of Object.entries(FRACTIONS)) {
    if (result === frac) {
      result = unicode;
      changed = true;
    }
  }

  // Subscripts: _{...} or _x (single char)
  result = result.replace(/_\{([^}]+)\}/g, (_m, inner) => {
    changed = true;
    return toSubscript(inner);
  });
  result = result.replace(/_([0-9a-z])/g, (_m, ch) => {
    changed = true;
    return toSubscript(ch);
  });

  // Superscripts: ^{...} or ^x (single char)
  result = result.replace(/\^\{([^}]+)\}/g, (_m, inner) => {
    changed = true;
    return toSuperscript(inner);
  });
  result = result.replace(/\^([0-9a-z+-])/g, (_m, ch) => {
    changed = true;
    return toSuperscript(ch);
  });

  // \text{...} → just the text
  result = result.replace(/\\text\{([^}]+)\}/g, (_m, inner) => {
    changed = true;
    return inner;
  });

  // Function names: \sin, \cos, etc. → sin, cos
  for (const fn of FUNCTIONS) {
    const fnCmd = `\\${fn}`;
    if (result.includes(fnCmd)) {
      result = result.split(fnCmd).join(fn);
      changed = true;
    }
  }

  // Strip remaining \left and \right
  result = result.replace(/\\left/g, '').replace(/\\right/g, '');
  if (result !== latex.trim()) changed = true;

  // Strip remaining braces used for grouping
  result = result.replace(/\{([^{}]+)\}/g, '$1');
  if (result !== latex.trim()) changed = true;

  return { text: result, converted: changed };
}

/**
 * Check if a LaTeX expression is "simple" enough to render as Unicode.
 * Complex expressions (matrices, multi-line, environments) should use
 * a full math renderer instead.
 */
export function isSimpleMath(latex: string): boolean {
  // Complex indicators — these need a full renderer
  const complexPatterns = [
    /\\begin\{/,       // environments (matrix, align, etc.)
    /\\end\{/,
    /\\\\/,            // line breaks in math
    /\\stackrel/,
    /\\overset/,
    /\\underset/,
    /\\overbrace/,
    /\\underbrace/,
  ];

  return !complexPatterns.some(p => p.test(latex));
}
