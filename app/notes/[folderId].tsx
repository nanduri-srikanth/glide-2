import React, { useMemo, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SectionList,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { NotesColors } from '@/constants/theme';
import { mockFolders } from '@/data/mockFolders';
import { getNotesByFolder } from '@/data/mockNotes';
import { SwipeableNoteCard } from '@/components/notes/SwipeableNoteCard';
import { SearchBar } from '@/components/notes/SearchBar';
import { ComposeButton } from '@/components/notes/ComposeButton';
import { MoveFolderSheet } from '@/components/notes/MoveFolderSheet';
import { UnifiedSearchOverlay } from '@/components/notes/UnifiedSearchOverlay';
import { Note } from '@/data/types';
import { useNotes } from '@/context/NotesContext';
import { useAuth } from '@/context/AuthContext';
import { notesService, NoteListItem } from '@/services/notes';
import { useUpdateNoteMutation, queryKeys } from '@/hooks/queries';

interface Section {
  title: string;
  data: Note[];
}

export default function NoteListScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { notes: apiNotes, folders, isLoading, error, fetchNotes, deleteNote, moveNote } = useNotes();
  const updateNoteMutation = useUpdateNoteMutation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [noteToMove, setNoteToMove] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveProcessingStatus, setMoveProcessingStatus] = useState('');

  const apiFolder = folders.find((f) => f.id === folderId);
  const mockFolder = mockFolders.find((f) => f.id === folderId);
  const folder = apiFolder || mockFolder;
  const isAllNotesFolder = folder?.name === 'All Notes';
  const isRealFolder = !!apiFolder; // Only true if folder exists in API response

  // Refresh notes when screen gains focus (after creating a new note, etc.)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && folderId) {
        // For "All Notes" folder, fetch all notes without folder filter
        if (isAllNotesFolder) {
          fetchNotes(undefined);
        } else if (isRealFolder) {
          // Only fetch with folder filter if it's a real API folder (valid UUID)
          fetchNotes(folderId);
        } else {
          // Mock folder - fetch all notes since we can't filter by mock ID
          fetchNotes(undefined);
        }
      }
    }, [isAuthenticated, folderId, isAllNotesFolder, isRealFolder, fetchNotes])
  );

  // Use API notes - only fall back to mock data if not authenticated
  const notes: Note[] = useMemo(() => {
    if (isAuthenticated) {
      // When authenticated, always use API notes (even if empty)
      return apiNotes.map(n => ({
        id: n.id,
        title: n.title,
        timestamp: n.created_at,
        transcript: n.preview || '',
        duration: n.duration || 0,
        actions: {
          calendar: Array.from({ length: n.calendar_count }, (_, i) => ({ id: String(i + 1), title: 'Event', date: '', time: '', status: 'pending' as const })),
          email: Array.from({ length: n.email_count }, (_, i) => ({ id: String(i + 1), to: '', subject: '', status: 'draft' as const })),
          reminders: Array.from({ length: n.reminder_count }, (_, i) => ({ id: String(i + 1), title: 'Reminder', dueDate: '', priority: 'medium' as const, status: 'pending' as const })),
          nextSteps: [],
        },
        folderId: n.folder_id || folderId || '',
        tags: n.tags || [],
        isPinned: n.is_pinned || false,
        sync_status: n.sync_status,
      }));
    }
    // Only use mock data when not authenticated
    return getNotesByFolder(folderId || '');
  }, [apiNotes, folderId, isAuthenticated]);

  // Notes are no longer filtered inline - search is handled by the overlay
  const filteredNotes = notes;

  const sections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Separate pinned notes first
    const pinnedNotes: Note[] = [];
    const unpinnedNotes: Note[] = [];

    filteredNotes.forEach((note) => {
      if (note.isPinned) {
        pinnedNotes.push(note);
      } else {
        unpinnedNotes.push(note);
      }
    });

    // Sort pinned notes by date (newest first)
    pinnedNotes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Group unpinned notes by date
    const todayNotes: Note[] = [];
    const weekNotes: Note[] = [];
    const olderNotes: Note[] = [];

    unpinnedNotes.forEach((note) => {
      const noteDate = new Date(note.timestamp);
      if (noteDate >= today) {
        todayNotes.push(note);
      } else if (noteDate >= weekAgo) {
        weekNotes.push(note);
      } else {
        olderNotes.push(note);
      }
    });

    const result: Section[] = [];

    // Pinned section always appears first (if there are pinned notes)
    if (pinnedNotes.length > 0) {
      result.push({ title: 'Pinned', data: pinnedNotes });
    }
    if (todayNotes.length > 0) {
      result.push({ title: 'Today', data: todayNotes });
    }
    if (weekNotes.length > 0) {
      result.push({ title: 'Previous 7 Days', data: weekNotes });
    }
    if (olderNotes.length > 0) {
      result.push({ title: 'Earlier', data: olderNotes });
    }

    return result;
  }, [filteredNotes]);

  const handleNotePress = (note: Note) => {
    router.push(`/notes/detail/${note.id}`);
  };

  const handleComposePress = () => {
    router.push({ pathname: '/recording', params: { folderId } });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isAuthenticated && folderId) {
      if (isAllNotesFolder) {
        await fetchNotes(undefined);
      } else {
        await fetchNotes(folderId);
      }
    }
    setRefreshing(false);
  }, [isAuthenticated, folderId, isAllNotesFolder, fetchNotes]);

  const handleSearchPress = useCallback(() => {
    setShowSearchOverlay(true);
  }, []);

  const handleSearchSelectFolder = useCallback((searchFolderId: string) => {
    setShowSearchOverlay(false);
    router.push(`/notes/${searchFolderId}`);
  }, [router]);

  const handleSearchSelectNote = useCallback((noteId: string) => {
    setShowSearchOverlay(false);
    router.push(`/notes/detail/${noteId}`);
  }, [router]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const success = await deleteNote(noteId);
    if (success) {
      // Refresh the list
      if (isAuthenticated && folderId) {
        await fetchNotes(isAllNotesFolder ? undefined : folderId);
      }
    } else {
      Alert.alert('Error', 'Failed to delete note. Please try again.');
    }
  }, [deleteNote, isAuthenticated, folderId, isAllNotesFolder, fetchNotes]);

  const handleMoveNote = useCallback((noteId: string) => {
    setNoteToMove(noteId);
    setShowMoveSheet(true);
  }, []);

  const handleSelectMoveFolder = useCallback(async (targetFolderId: string) => {
    if (!noteToMove) return;

    setIsMoving(true);
    setMoveProcessingStatus('Moving note...');
    const success = await moveNote(noteToMove, targetFolderId);
    setIsMoving(false);
    setMoveProcessingStatus('');

    if (success) {
      setShowMoveSheet(false);
      setNoteToMove(null);
      // Refresh the current list
      if (isAuthenticated && folderId) {
        await fetchNotes(isAllNotesFolder ? undefined : folderId);
      }
    } else {
      Alert.alert('Error', 'Failed to move note. Please try again.');
    }
  }, [noteToMove, moveNote, isAuthenticated, folderId, isAllNotesFolder, fetchNotes]);

  const handleAutoSort = useCallback(async () => {
    if (!noteToMove) return;

    setIsMoving(true);
    setMoveProcessingStatus('AI is analyzing your note...');

    const { data, error } = await notesService.autoSortNote(noteToMove);

    setIsMoving(false);
    setMoveProcessingStatus('');

    if (data) {
      const folderName = data.folder_name;
      setShowMoveSheet(false);
      setNoteToMove(null);

      // Show where the note was moved
      if (folderName) {
        Alert.alert('Note Moved', `Moved to "${folderName}"`);
      }

      // Refresh the current list
      if (isAuthenticated && folderId) {
        await fetchNotes(isAllNotesFolder ? undefined : folderId);
      }
    } else {
      Alert.alert('Error', error || 'Failed to auto-sort note. Please try again.');
    }
  }, [noteToMove, isAuthenticated, folderId, isAllNotesFolder, fetchNotes]);

  const handlePinNote = useCallback((noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const newPinnedState = !note.isPinned;

    // Optimistic update - update all note list queries in cache
    queryClient.setQueriesData(
      { queryKey: queryKeys.notes.lists() },
      (oldData: any) => {
        if (!oldData) return oldData;
        // Handle both array and object with items
        if (Array.isArray(oldData)) {
          return oldData.map((n: NoteListItem) =>
            n.id === noteId ? { ...n, is_pinned: newPinnedState } : n
          );
        }
        if (oldData.items) {
          return {
            ...oldData,
            items: oldData.items.map((n: NoteListItem) =>
              n.id === noteId ? { ...n, is_pinned: newPinnedState } : n
            ),
          };
        }
        return oldData;
      }
    );

    // Update in background (writes to SQLite + queues for sync)
    updateNoteMutation.mutate(
      { noteId, data: { is_pinned: newPinnedState } },
      {
        onError: () => {
          // Revert on error by refetching
          queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
          Alert.alert('Error', 'Failed to update note. Please try again.');
        },
      }
    );
  }, [notes, updateNoteMutation, queryClient]);

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      {section.title === 'Pinned' && (
        <Ionicons name="pin" size={18} color="#FF9500" style={styles.pinnedIcon} />
      )}
      <Text style={[
        styles.sectionTitle,
        section.title === 'Pinned' && styles.pinnedSectionTitle
      ]}>
        {section.title}
      </Text>
    </View>
  );

  const renderNote = ({ item }: { item: Note }) => (
    <SwipeableNoteCard
      note={item}
      onPress={() => handleNotePress(item)}
      onDelete={handleDeleteNote}
      onMove={handleMoveNote}
      onPin={handlePinNote}
      isEditMode={false}
      isSelected={false}
      onSelect={() => {}}
    />
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: folder?.name || 'Notes',
          }}
        />

        <SectionList
          sections={sections}
          renderItem={renderNote}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={NotesColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {isLoading ? (
                <ActivityIndicator size="large" color={NotesColors.primary} />
              ) : (
                <Text style={styles.emptyText}>{typeof error === 'string' ? error : 'No notes found'}</Text>
              )}
            </View>
          }
        />

        <SearchBar
          onPress={handleSearchPress}
          placeholder="Search"
        />
        <ComposeButton onPress={handleComposePress} />

        <UnifiedSearchOverlay
          visible={showSearchOverlay}
          onClose={() => setShowSearchOverlay(false)}
          onSelectFolder={handleSearchSelectFolder}
          onSelectNote={handleSearchSelectNote}
        />

        <MoveFolderSheet
          visible={showMoveSheet}
          currentFolderId={folderId}
          onSelectFolder={handleSelectMoveFolder}
          onAutoSort={handleAutoSort}
          onClose={() => {
            setShowMoveSheet(false);
            setNoteToMove(null);
          }}
          isProcessing={isMoving}
          processingStatus={moveProcessingStatus}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: NotesColors.background,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: NotesColors.textPrimary,
  },
  pinnedSectionTitle: {
    color: '#FF9500',
  },
  pinnedIcon: {
    marginRight: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 17,
    color: NotesColors.textSecondary,
  },
});
