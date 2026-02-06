import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { Folder } from '@/data/types';

interface FolderCardProps {
  folder: Folder;
  onPress: () => void;
}

export function FolderCard({ folder, onPress }: FolderCardProps) {
  const getIconName = (icon: string): keyof typeof Ionicons.glyphMap => {
    // Map SF Symbols to Ionicons
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      'folder.fill': 'folder',
      'trash.fill': 'trash',
      'lightbulb.fill': 'bulb',
      'person.2.fill': 'people',
    };
    return iconMap[icon] || 'folder';
  };

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={getIconName(folder.icon)}
          size={22}
          color={NotesColors.primary}
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{folder.name}</Text>
      </View>
      <View style={styles.rightContainer}>
        <Text style={styles.count}>{folder.noteCount}</Text>
        <Ionicons name="chevron-forward" size={20} color={NotesColors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'NotesColors.aiPanelBackground',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  count: {
    fontSize: 17,
    color: NotesColors.textSecondary,
    marginRight: 4,
  },
});
