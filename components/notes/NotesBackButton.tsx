import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';

interface NotesBackButtonProps {
  onPress: () => void | Promise<void>;
  accessibilityLabel?: string;
}

export function NotesBackButton({
  onPress,
  accessibilityLabel = 'Back',
}: NotesBackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.backButton}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="chevron-back" size={26} color={NotesColors.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
});

export default NotesBackButton;
