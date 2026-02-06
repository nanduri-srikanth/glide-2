import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';

interface SearchBarProps {
  onPress: () => void;
  onMicPress?: () => void;
  placeholder?: string;
}

export function SearchBar({
  onPress,
  onMicPress,
  placeholder = 'Search',
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.searchContainer}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Ionicons name="search" size={18} color={NotesColors.textSecondary} />
        <Text style={styles.placeholderText}>{placeholder}</Text>
      </TouchableOpacity>
      {onMicPress && (
        <TouchableOpacity style={styles.micButton} onPress={onMicPress}>
          <Ionicons name="mic" size={20} color={NotesColors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  placeholderText: {
    flex: 1,
    fontSize: 16,
    color: NotesColors.textSecondary,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: NotesColors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
