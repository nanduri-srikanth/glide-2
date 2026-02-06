import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useNotes } from '@/context/NotesContext';
import { useAuth } from '@/context/AuthContext';
import { Folder } from '@/data/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = 320;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.7;

interface FolderSelectionSheetProps {
  visible: boolean;
  onSelectFolder: (folderId: string) => void;
  onAutoSort: () => void;
  onCreateFolder: () => void;
  onClose: () => void;
  isProcessing?: boolean;
  processingStatus?: string;
}

export function FolderSelectionSheet({
  visible,
  onSelectFolder,
  onAutoSort,
  onCreateFolder,
  onClose,
  isProcessing = false,
  processingStatus = '',
}: FolderSelectionSheetProps) {
  const { folders, fetchFolders } = useNotes();
  const { isAuthenticated } = useAuth();
  const [showFolderList, setShowFolderList] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const heightAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // Fetch folders when sheet becomes visible
  useEffect(() => {
    if (visible && isAuthenticated) {
      setIsLoadingFolders(true);
      fetchFolders().finally(() => setIsLoadingFolders(false));
    }
  }, [visible, isAuthenticated]);

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

  // Filter out "All Notes" since it's a virtual folder that shows all notes
  const displayFolders: Folder[] = folders
    .filter(f => f.name !== 'All Notes')
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

  useEffect(() => {
    if (visible) {
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
      setShowFolderList(false);
    }
  }, [visible]);

  useEffect(() => {
    Animated.spring(heightAnim, {
      toValue: showFolderList ? EXPANDED_HEIGHT : SHEET_HEIGHT,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
  }, [showFolderList]);

  const handleSelectFolderOption = () => {
    setShowFolderList(true);
  };

  const handleFolderPress = (folderId: string) => {
    onSelectFolder(folderId);
  };

  const renderFolder = ({ item }: { item: Folder }) => (
    <TouchableOpacity
      style={styles.folderItem}
      onPress={() => handleFolderPress(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.folderItemIcon}>
        <Ionicons name={item.icon as any || 'folder'} size={20} color={NotesColors.primary} />
      </View>
      <Text style={styles.folderItemName}>{item.name}</Text>
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
          {
            height: heightAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handleBar} />

        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={NotesColors.primary} />
            <Text style={styles.processingText}>{processingStatus || 'Processing...'}</Text>
          </View>
        ) : showFolderList ? (
          <View style={styles.folderListContainer}>
            {/* Back button and title */}
            <View style={styles.listHeader}>
              <TouchableOpacity onPress={() => setShowFolderList(false)} style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color={NotesColors.primary} />
              </TouchableOpacity>
              <Text style={styles.listTitle}>Select Folder</Text>
              <View style={styles.placeholder} />
            </View>

            {/* Folder list */}
            {isLoadingFolders ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={NotesColors.primary} />
                <Text style={styles.loadingText}>Loading folders...</Text>
              </View>
            ) : displayFolders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={NotesColors.textSecondary} />
                <Text style={styles.emptyText}>No folders yet</Text>
                <Text style={styles.emptySubtext}>Create a folder or use Auto-sort</Text>
              </View>
            ) : (
              <FlatList
                data={displayFolders}
                renderItem={renderFolder}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        ) : (
          <>
            {/* Title */}
            <Text style={styles.title}>Save to</Text>

            {/* Three square options */}
            <View style={styles.optionsRow}>
              {/* Auto-sort */}
              <TouchableOpacity style={styles.optionButton} onPress={onAutoSort} activeOpacity={0.7}>
                <View style={[styles.optionIcon, styles.autoSortIcon]}>
                  <Ionicons name="sparkles" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.optionLabel}>Auto-sort</Text>
              </TouchableOpacity>

              {/* New Folder */}
              <TouchableOpacity style={styles.optionButton} onPress={onCreateFolder} activeOpacity={0.7}>
                <View style={[styles.optionIcon, styles.newFolderIcon]}>
                  <Ionicons name="add" size={32} color={NotesColors.primary} />
                </View>
                <Text style={styles.optionLabel}>New Folder</Text>
              </TouchableOpacity>

              {/* Select Folder */}
              <TouchableOpacity style={styles.optionButton} onPress={handleSelectFolderOption} activeOpacity={0.7}>
                <View style={[styles.optionIcon, styles.selectFolderIcon]}>
                  <Ionicons name="folder" size={32} color={NotesColors.primary} />
                </View>
                <Text style={styles.optionLabel}>Choose</Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  optionButton: {
    alignItems: 'center',
    gap: 10,
  },
  optionIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoSortIcon: {
    backgroundColor: NotesColors.primary,
  },
  newFolderIcon: {
    backgroundColor: NotesColors.aiPanelBackground,
    borderWidth: 2,
    borderColor: NotesColors.primary,
    borderStyle: 'dashed',
  },
  selectFolderIcon: {
    backgroundColor: NotesColors.aiPanelBackground,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: NotesColors.textPrimary,
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
  folderListContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  listTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  placeholder: {
    width: 32,
  },
  listContent: {
    paddingHorizontal: 16,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
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
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: NotesColors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
});
