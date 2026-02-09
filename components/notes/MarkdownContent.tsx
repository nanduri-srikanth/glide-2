import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { NotesColors } from '@/constants/theme';
import { parseMathSpans, containsMath } from '@/lib/math';
import { MathSpan } from './MathSpan';

interface MarkdownContentProps {
  content: string;
}

/**
 * Pre-processes markdown to extract block-math ($$...$$) sections.
 * Block math is split out into separate render passes; inline math ($...$)
 * is handled by a custom `code_inline` rule override below.
 *
 * Returns an array of { type: 'markdown' | 'block-math', content: string }.
 */
function splitBlockMath(text: string): Array<{ type: 'markdown' | 'block-math'; content: string }> {
  const parts: Array<{ type: 'markdown' | 'block-math'; content: string }> = [];
  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'markdown', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'block-math', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'markdown', content: text.slice(lastIndex) });
  }

  return parts;
}

/**
 * For markdown sections, replace inline math ($...$) with code backticks
 * so the markdown renderer picks them up via `code_inline`, which we
 * override to render as math.
 *
 * We use a unique prefix so we can distinguish math code from regular code:
 * `$MATH:...` — the MathCodeInline renderer strips this prefix.
 */
function convertInlineMathToCode(md: string): string {
  // Match $...$ but not $$
  return md.replace(/(?<!\$)\$([^\s$][^$]*?[^\s$])\$(?!\$)|\$([^\s$])\$(?!\$)/g, (_m, multi, single) => {
    const latex = multi !== undefined ? multi : single;
    return '`$MATH:' + latex + '`';
  });
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const hasMath = useMemo(() => containsMath(content), [content]);

  // Fast path: no math → render directly
  if (!hasMath) {
    return (
      <Markdown style={markdownStyles}>
        {content}
      </Markdown>
    );
  }

  // Split block math out, handle inline math via code override
  const parts = splitBlockMath(content);

  return (
    <View>
      {parts.map((part, i) => {
        if (part.type === 'block-math') {
          return <MathSpan key={i} latex={part.content} type="block-math" />;
        }

        const processed = convertInlineMathToCode(part.content);
        return (
          <Markdown
            key={i}
            style={markdownStyles}
            rules={{
              code_inline: (node: any, children: any, parent: any, styles: any) => {
                const text: string = node.content || '';
                if (text.startsWith('$MATH:')) {
                  const latex = text.slice(6);
                  return (
                    <MathSpan key={node.key} latex={latex} type="inline-math" />
                  );
                }
                // Regular inline code
                return (
                  <Text key={node.key} style={styles.code_inline}>
                    {text}
                  </Text>
                );
              },
            }}
          >
            {processed}
          </Markdown>
        );
      })}
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  // Main body text
  body: {
    color: NotesColors.textPrimary,
    fontSize: 16,
    lineHeight: 26,
  },

  // Headings
  heading1: {
    fontSize: 24,
    fontWeight: '700',
    color: NotesColors.textPrimary,
    marginTop: 20,
    marginBottom: 10,
  },
  heading2: {
    fontSize: 20,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginTop: 18,
    marginBottom: 8,
  },
  heading3: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginTop: 14,
    marginBottom: 6,
  },

  // Paragraphs
  paragraph: {
    marginTop: 0,
    marginBottom: 12,
  },

  // Bold and italic
  strong: {
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
  },

  // Lists
  bullet_list: {
    marginBottom: 12,
  },
  ordered_list: {
    marginBottom: 12,
  },
  list_item: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bullet_list_icon: {
    color: NotesColors.primary,
    fontSize: 16,
    marginRight: 8,
  },
  ordered_list_icon: {
    color: NotesColors.primary,
    fontSize: 16,
    marginRight: 8,
    fontWeight: '600',
  },
  bullet_list_content: {
    flex: 1,
  },
  ordered_list_content: {
    flex: 1,
  },

  // Code blocks
  code_inline: {
    backgroundColor: 'rgba(98, 69, 135, 0.15)',
    color: NotesColors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  code_block: {
    backgroundColor: 'rgba(98, 69, 135, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: 'rgba(98, 69, 135, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },

  // Blockquotes
  blockquote: {
    backgroundColor: 'rgba(98, 69, 135, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: NotesColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },

  // Horizontal rule
  hr: {
    backgroundColor: NotesColors.border,
    height: 1,
    marginVertical: 16,
  },

  // Links
  link: {
    color: NotesColors.primary,
    textDecorationLine: 'underline',
  },

  // Tables
  table: {
    borderWidth: 1,
    borderColor: NotesColors.border,
    borderRadius: 8,
    marginVertical: 12,
  },
  thead: {
    backgroundColor: 'rgba(98, 69, 135, 0.1)',
  },
  th: {
    padding: 10,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  tr: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: NotesColors.border,
  },
  td: {
    padding: 10,
    color: NotesColors.textPrimary,
  },

  // Checkbox (for task lists)
  textgroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

export default MarkdownContent;
