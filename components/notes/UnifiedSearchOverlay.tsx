import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useNetwork } from '@/context/NetworkContext';
import { notesService, FolderResponse, NoteListItem } from '@/services/notes';

interface UnifiedSearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  onSelectFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
}

type SearchResultItem =
  | { type: 'folder'; data: FolderResponse }
  | { type: 'note'; data: NoteListItem }
  | { type: 'section'; title: string };

export function UnifiedSearchOverlay({
  visible,
  onClose,
  onSelectFolder,
  onSelectNote,
}: UnifiedSearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const { isOnline } = useNetwork();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when overlay opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when closing
      setQuery('');
      setFolders([]);
      setNotes([]);
    }
  }, [visible]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setFolders([]);
      setNotes([]);
      return;
    }

    setIsLoading(true);
    const { data, error } = await notesService.unifiedSearch(searchQuery);
    setIsLoading(false);

    if (data) {
      setFolders(data.folders);
      setNotes(data.notes);
    } else if (error) {
      console.error('Search error:', error);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(text);
    }, 300);
  }, [performSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    setFolders([]);
    setNotes([]);
    inputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleSelectFolder = useCallback((folderId: string) => {
    Keyboard.dismiss();
    onSelectFolder(folderId);
    onClose();
  }, [onSelectFolder, onClose]);

  const handleSelectNote = useCallback((noteId: string) => {
    Keyboard.dismiss();
    onSelectNote(noteId);
    onClose();
  }, [onSelectNote, onClose]);

  // Build flat list with section headers
  const listData: SearchResultItem[] = [];
  if (folders.length > 0) {
    listData.push({ type: 'section', title: 'Folders' });
    folders.forEach(folder => {
      listData.push({ type: 'folder', data: folder });
    });
  }
  if (notes.length > 0) {
    listData.push({ type: 'section', title: 'Notes' });
    notes.forEach(note => {
      listData.push({ type: 'note', data: note });
    });
  }

  const renderItem = ({ item }: { item: SearchResultItem }) => {
    if (item.type === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
        </View>
      );
    }

    if (item.type === 'folder') {
      return (
        <TouchableOpacity
          style={styles.resultItem}
          onPress={() => handleSelectFolder(item.data.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: item.data.color || NotesColors.primary }]}>
            <Ionicons name="folder" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.resultContent}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {item.data.name}
            </Text>
            <Text style={styles.resultSubtitle}>
              {item.data.note_count} {item.data.note_count === 1 ? 'note' : 'notes'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={NotesColors.textSecondary} />
        </TouchableOpacity>
      );
    }

    if (item.type === 'note') {
      return (
        <TouchableOpacity
          style={styles.resultItem}
          onPress={() => handleSelectNote(item.data.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: NotesColors.card }]}>
            <Ionicons name="document-text" size={20} color={NotesColors.textSecondary} />
          </View>
          <View style={styles.resultContent}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {item.data.title}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {item.data.preview}
            </Text>
            {!isOnline && item.data.sync_status === 'pending' && (
              <View style={styles.pendingRow}>
                <Ionicons name="cloud-offline-outline" size={12} color={NotesColors.textSecondary} />
                <Text style={styles.pendingText}>Waiting to sync</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={NotesColors.textSecondary} />
        </TouchableOpacity>
      );
    }

    return null;
  };

  const keyExtractor = (item: SearchResultItem, index: number) => {
    if (item.type === 'section') return `section-${item.title}`;
    if (item.type === 'folder') return `folder-${item.data.id}`;
    if (item.type === 'note') return `note-${item.data.id}`;
    return `item-${index}`;
  };

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={NotesColors.primary} />
        </View>
      );
    }

    if (query.trim() && folders.length === 0 && notes.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={48} color={NotesColors.textSecondary} />
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try a different search term</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search" size={48} color={NotesColors.textSecondary} />
        <Text style={styles.emptyText}>Search notes and folders</Text>
        <Text style={styles.emptySubtext}>Start typing to search</Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Search Header */}
        <View style={styles.header}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={NotesColors.textSecondary} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search notes and folders"
              placeholderTextColor={NotesColors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear}>
                <Ionicons name="close-circle" size={18} color={NotesColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={renderEmptyState}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: NotesColors.border,
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
  input: {
    flex: 1,
    fontSize: 16,
    color: NotesColors.textPrimary,
    padding: 0,
  },
  cancelButton: {
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 17,
    color: NotesColors.primary,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: NotesColors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  resultSubtitle: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  pendingText: {
    fontSize: 12,
    color: NotesColors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  emptySubtext: {
    fontSize: 15,
    color: NotesColors.textSecondary,
  },
});
