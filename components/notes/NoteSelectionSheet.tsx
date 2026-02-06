/**
 * NoteSelectionSheet - Bottom sheet for selecting an existing note to append content to
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  FlatList,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useNotes } from '@/context/NotesContext';
import { useAuth } from '@/context/AuthContext';
import { notesService, NoteListItem } from '@/services/notes';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

interface NoteSelectionSheetProps {
  visible: boolean;
  onSelectNote: (noteId: string, noteTitle: string) => void;
  onClose: () => void;
}

export function NoteSelectionSheet({
  visible,
  onSelectNote,
  onClose,
}: NoteSelectionSheetProps) {
  const { folders } = useNotes();
  const { isAuthenticated } = useAuth();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // Build folder name lookup map
  const folderNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    const addFolders = (folderList: typeof folders) => {
      for (const folder of folderList) {
        map[folder.id] = folder.name;
        if (folder.children) {
          addFolders(folder.children);
        }
      }
    };
    addFolders(folders);
    return map;
  }, [folders]);

  // Fetch all notes when sheet becomes visible
  useEffect(() => {
    if (visible && isAuthenticated) {
      fetchAllNotes();
    }
  }, [visible, isAuthenticated]);

  // Animate sheet
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
      // Reset state when closing
      setSearchQuery('');
    }
  }, [visible]);

  const fetchAllNotes = async () => {
    setIsLoading(true);
    // Fetch a large number of notes to show all
    const { data, error } = await notesService.listNotes({ per_page: 500 });
    if (data) {
      // Sort by updated_at descending (most recently updated first)
      // Fall back to created_at if updated_at is not available
      const sortedNotes = [...data.items].sort((a, b) => {
        const dateA = a.updated_at || a.created_at;
        const dateB = b.updated_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      setNotes(sortedNotes);
    }
    setIsLoading(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await fetchAllNotes();
      return;
    }

    setIsLoading(true);
    const { data } = await notesService.searchNotes(query);
    if (data) {
      // Sort search results by updated_at descending too
      const sortedNotes = [...data.items].sort((a, b) => {
        const dateA = a.updated_at || a.created_at;
        const dateB = b.updated_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      setNotes(sortedNotes);
    }
    setIsLoading(false);
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderNoteItem = ({ item }: { item: NoteListItem }) => {
    const folderName = item.folder_id ? folderNameMap[item.folder_id] : null;

    return (
      <TouchableOpacity
        style={styles.noteItem}
        onPress={() => onSelectNote(item.id, item.title)}
        activeOpacity={0.7}
      >
        <View style={styles.noteContent}>
          <Text style={styles.noteTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.preview && (
            <Text style={styles.notePreview} numberOfLines={2}>
              {item.preview}
            </Text>
          )}
          <View style={styles.noteMeta}>
            {folderName && (
              <View style={styles.folderBadge}>
                <Ionicons name="folder" size={10} color={NotesColors.primary} />
                <Text style={styles.folderName}>{folderName}</Text>
              </View>
            )}
            <Text style={styles.noteDate}>{formatRelativeTime(item.updated_at || item.created_at)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={NotesColors.textSecondary} />
      </TouchableOpacity>
    );
  };

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
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={NotesColors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Add to Note</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={NotesColors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notes..."
            placeholderTextColor={NotesColors.textSecondary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={18} color={NotesColors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Section Header */}
        <Text style={styles.sectionTitle}>
          {searchQuery ? 'SEARCH RESULTS' : 'ALL NOTES'}
        </Text>

        {/* Notes List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={NotesColors.primary} />
            <Text style={styles.loadingText}>Loading notes...</Text>
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={NotesColors.textSecondary} />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No notes found' : 'No notes yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search term' : 'Create your first note to get started'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={notes}
            renderItem={renderNoteItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  placeholder: {
    width: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.background,
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: NotesColors.textPrimary,
    padding: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.background,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  noteContent: {
    flex: 1,
    marginRight: 8,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginBottom: 4,
  },
  notePreview: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  folderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.aiPanelBackground,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  folderName: {
    fontSize: 11,
    fontWeight: '500',
    color: NotesColors.primary,
  },
  noteDate: {
    fontSize: 12,
    color: NotesColors.textSecondary,
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
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default NoteSelectionSheet;
