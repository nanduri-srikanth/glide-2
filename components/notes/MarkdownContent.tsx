import React from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { NotesColors } from '@/constants/theme';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Markdown style={markdownStyles}>
      {content}
    </Markdown>
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
