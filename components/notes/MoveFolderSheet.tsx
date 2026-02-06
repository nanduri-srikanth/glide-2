import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useNotes } from '@/context/NotesContext';
import { Folder } from '@/data/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.5;

interface MoveFolderSheetProps {
  visible: boolean;
  currentFolderId?: string;
  onSelectFolder: (folderId: string) => void;
  onAutoSort?: () => void;
  onClose: () => void;
  isProcessing?: boolean;
  processingStatus?: string;
}

export function MoveFolderSheet({
  visible,
  currentFolderId,
  onSelectFolder,
  onAutoSort,
  onClose,
  isProcessing = false,
  processingStatus,
}: MoveFolderSheetProps) {
  const { folders, fetchFolders } = useNotes();
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      setIsLoadingFolders(true);
      fetchFolders().finally(() => setIsLoadingFolders(false));

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: false,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  }, [visible]);

  // Map SF Symbol names to Ionicons equivalents
  const mapIconToIonicons = (icon: string): string => {
    const iconMap: Record<string, string> = {
      'folder.fill': 'folder',
      'folder': 'folder-outline',
      'briefcase.fill': 'briefcase',
      'briefcase': 'briefcase-outline',
      'person.fill': 'person',
      'person': 'person-outline',
      'lightbulb.fill': 'bulb',
      'lightbulb': 'bulb-outline',
      'calendar': 'calendar-outline',
      'star.fill': 'star',
      'star': 'star-outline',
      'heart.fill': 'heart',
      'heart': 'heart-outline',
      'house.fill': 'home',
      'house': 'home-outline',
    };
    return iconMap[icon] || icon || 'folder-outline';
  };

  // Filter out "All Notes" and current folder
  const displayFolders: Folder[] = folders
    .filter(f => f.name !== 'All Notes' && f.id !== currentFolderId)
    .map(f => ({
      id: f.id,
      name: f.name,
      icon: mapIconToIonicons(f.icon),
      noteCount: f.note_count,
      color: f.color || undefined,
      isSystem: f.is_system,
      sortOrder: f.sort_order || 0,
      depth: f.depth || 0,
    }));

  const renderFolder = ({ item }: { item: Folder }) => (
    <TouchableOpacity
      style={styles.folderItem}
      onPress={() => onSelectFolder(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.folderItemIcon}>
        <Ionicons name={item.icon as any || 'folder'} size={20} color={NotesColors.primary} />
      </View>
      <Text style={styles.folderItemName}>{item.name}</Text>
      <Text style={styles.folderItemCount}>{item.noteCount} notes</Text>
      <Ionicons name="chevron-forward" size={18} color={NotesColors.textSecondary} />
    </TouchableOpacity>
  );

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handleBar} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Move to Folder</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={NotesColors.textSecondary} />
          </TouchableOpacity>
        </View>

        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={NotesColors.primary} />
            <Text style={styles.processingText}>{processingStatus || 'Moving note...'}</Text>
          </View>
        ) : isLoadingFolders ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={NotesColors.primary} />
            <Text style={styles.loadingText}>Loading folders...</Text>
          </View>
        ) : (
          <>
            {/* Auto-sort option */}
            {onAutoSort && (
              <View style={styles.autoSortContainer}>
                <TouchableOpacity
                  style={styles.autoSortButton}
                  onPress={onAutoSort}
                  activeOpacity={0.7}
                >
                  <View style={styles.autoSortIcon}>
                    <Ionicons name="sparkles" size={20} color="#FFD60A" />
                  </View>
                  <View style={styles.autoSortText}>
                    <Text style={styles.autoSortTitle}>Auto-sort with AI</Text>
                    <Text style={styles.autoSortDescription}>Let AI choose the best folder</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={NotesColors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {displayFolders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={NotesColors.textSecondary} />
                <Text style={styles.emptyText}>No other folders available</Text>
              </View>
            ) : (
              <FlatList
                data={displayFolders}
                renderItem={renderFolder}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={onAutoSort ? null : undefined}
              />
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: NotesColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  handleBar: {
    width: 36,
    height: 5,
    backgroundColor: NotesColors.textSecondary,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.background,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  folderItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NotesColors.aiPanelBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderItemName: {
    flex: 1,
    fontSize: 16,
    color: NotesColors.textPrimary,
  },
  folderItemCount: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    marginRight: 4,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  processingText: {
    fontSize: 16,
    color: NotesColors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
  },
  autoSortContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  autoSortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 214, 10, 0.1)',
    padding: 14,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.3)',
  },
  autoSortIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 214, 10, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoSortText: {
    flex: 1,
  },
  autoSortTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  autoSortDescription: {
    fontSize: 13,
    color: NotesColors.textSecondary,
    marginTop: 2,
  },
});
