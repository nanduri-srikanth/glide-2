/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#8B85D0';  // Deeper lavender
const tintColorDark = '#fff';

// Notes App Soft Lavender Color Scheme - Light Mode
// Pastel lavender, lilac, and periwinkle palette
export const NotesColors = {
  primary: '#8B85D0',      // Deeper lavender - Folder icons, buttons (darkened for contrast)
  secondary: '#B9B7EB',    // Lavender - Action badges, highlights
  accent: '#A78BDB',       // Purple blend - Links, CTAs
  background: '#F0EFFE',   // Light lavender background
  card: '#FAFAFF',         // Soft white card backgrounds
  textPrimary: '#2D2A4A',  // Deep purple-navy text
  textSecondary: '#6B6899', // Muted purple-gray text
  border: '#E5E4EB',       // Light border color
  // Derived colors for AI Summary Panel
  aiPanelBackground: 'rgba(185, 183, 235, 0.15)',
  aiPanelBorder: 'rgba(185, 183, 235, 0.4)',
  // Action badge colors
  calendarBadge: '#B9B7EB',  // Lavender
  emailBadge: '#D4B7EB',     // Lilac
  reminderBadge: '#B7CEEB',  // Periwinkle blue
};

export const Colors = {
  light: {
    text: '#2D2A4A',
    background: '#F0EFFE',
    tint: '#8B85D0',
    icon: '#6B6899',
    tabIconDefault: '#6B6899',
    tabIconSelected: '#8B85D0',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
