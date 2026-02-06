import React, { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, SafeAreaView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { DraggableFolderList } from '@/components/notes/DraggableFolderList';
import { SearchBar } from '@/components/notes/SearchBar';
import { ComposeButton } from '@/components/notes/ComposeButton';
import { UnifiedSearchOverlay } from '@/components/notes/UnifiedSearchOverlay';
import { useNotes } from '@/context/NotesContext';
import { useAuth } from '@/context/AuthContext';
import { Folder } from '@/data/types';
import { mockFolders } from '@/data/mockFolders';
import { notesService } from '@/services/notes';

export default function FoldersScreen() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuth();
  const {
    folders,
    isLoading,
    error,
    fetchFolders,
    deleteFolder,
    expandedFolderIds,
    toggleFolderExpanded,
    reorderFolders,
    buildFlattenedTree,
  } = useNotes();
  const [refreshing, setRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);

  // Refresh folders when screen gains focus (after creating a note, etc.)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) fetchFolders();
    }, [isAuthenticated, fetchFolders])
  );

  // Helper to convert API folder to display format
  const convertFolder = useCallback((f: any): Folder => ({
    id: f.id,
    name: f.name,
    icon: f.icon,
    noteCount: f.note_count,
    color: f.color || undefined,
    isSystem: f.is_system,
    sortOrder: f.sort_order || 0,
    parentId: f.parent_id,
    depth: f.depth || 0,
    children: f.children?.map((c: any) => convertFolder(c)),
  }), []);

  // Convert API folders to display format with tree structure
  // Only show mock folders when NOT authenticated
  const displayFolders: Folder[] = useMemo(() => {
    if (isAuthenticated) {
      // When authenticated, always use API folders (even if empty)
      if (folders.length > 0) {
        return buildFlattenedTree();
      }
      return []; // Return empty array while loading or if no folders
    }
    // Mock folders only for unauthenticated state
    return mockFolders.map(f => ({
      ...f,
      sortOrder: f.sortOrder || 0,
      depth: f.depth || 0,
      children: [],
    }));
  }, [isAuthenticated, folders, buildFlattenedTree]);

  // Get folders for display (no longer filtered inline - handled by overlay)
  const filteredFolders = useMemo(() => {
    if (isAuthenticated) {
      return folders.map(convertFolder);
    }
    // Mock folders for unauthenticated
    return mockFolders.map(f => ({
      ...f,
      sortOrder: f.sortOrder || 0,
      depth: f.depth || 0,
      children: [],
    }));
  }, [isAuthenticated, folders, convertFolder]);

  const handleFolderPress = useCallback((folder: Folder) => {
    router.push(`/notes/${folder.id}`);
  }, [router]);

  const handleSearchPress = useCallback(() => {
    setShowSearchOverlay(true);
  }, []);

  const handleSearchSelectFolder = useCallback((folderId: string) => {
    setShowSearchOverlay(false);
    router.push(`/notes/${folderId}`);
  }, [router]);

  const handleSearchSelectNote = useCallback((noteId: string) => {
    setShowSearchOverlay(false);
    router.push(`/notes/detail/${noteId}`);
  }, [router]);

  const handleComposePress = () => router.push('/recording');

  const handleAddFolder = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to create folders.');
      return;
    }

    Alert.prompt(
      'New Folder',
      'Enter a name for this folder',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name: string | undefined) => {
            if (name?.trim()) {
              const { data, error } = await notesService.createFolder({
                name: name.trim(),
                icon: 'folder',
              });

              if (error) {
                Alert.alert('Error', error);
                return;
              }

              if (data) {
                await fetchFolders();
              }
            }
          },
        },
      ],
      'plain-text',
      '',
      'default'
    );
  };

  const handleAuthPress = () => {
    if (isAuthenticated) {
      Alert.alert(
        'Account',
        `Signed in as ${user?.email || 'User'}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
        ]
      );
    } else {
      router.push('/auth');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isAuthenticated) await fetchFolders();
    setRefreshing(false);
  }, [isAuthenticated, fetchFolders]);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    const success = await deleteFolder(folderId);
    if (!success) {
      Alert.alert('Error', 'Failed to delete folder. Please try again.');
    }
  }, [deleteFolder]);

  const handleToggleExpanded = useCallback((folderId: string) => {
    toggleFolderExpanded(folderId);
  }, [toggleFolderExpanded]);

  const handleReorder = useCallback(async (updates: any[]) => {
    const success = await reorderFolders(updates);
    if (!success) {
      Alert.alert('Error', 'Failed to reorder folders. Please try again.');
    }
    return success;
  }, [reorderFolders]);

  const renderHeader = () => (
    <View style={styles.header}>
      {!isAuthenticated && (
        <TouchableOpacity style={styles.signInBanner} onPress={handleAuthPress}>
          <Ionicons name="log-in-outline" size={16} color={NotesColors.primary} />
          <Text style={styles.signInBannerText}>Sign in to sync your notes</Text>
          <Ionicons name="chevron-forward" size={16} color={NotesColors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      {isLoading ? (
        <ActivityIndicator size="large" color={NotesColors.primary} />
      ) : (
        <Text style={styles.emptyText}>{error || 'No folders found'}</Text>
      )}
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Folders</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.iconButton} onPress={handleAuthPress}>
              <Ionicons
                name={isAuthenticated ? 'person-circle' : 'person-circle-outline'}
                size={28}
                color={isAuthenticated ? NotesColors.primary : NotesColors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleAddFolder}>
              <View style={styles.addFolderIcon}>
                <Ionicons name="folder-outline" size={24} color={NotesColors.primary} />
                <View style={styles.addBadge}>
                  <Ionicons name="add" size={12} color={NotesColors.textPrimary} />
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editButton} onPress={toggleEditMode}>
              <Text style={isEditMode ? styles.doneText : styles.editText}>
                {isEditMode ? 'Done' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {isEditMode ? (
          <DraggableFolderList
            folders={filteredFolders}
            isEditMode={isEditMode}
            isLoading={isLoading}
            expandedFolderIds={expandedFolderIds}
            onFolderPress={handleFolderPress}
            onDeleteFolder={handleDeleteFolder}
            onToggleExpanded={handleToggleExpanded}
            onReorder={handleReorder}
            ListHeaderComponent={renderHeader()}
            ListEmptyComponent={renderEmptyComponent()}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={NotesColors.primary}
              />
            }
          >
            {renderHeader()}
            <DraggableFolderList
              folders={filteredFolders}
              isEditMode={false}
              isLoading={isLoading}
              expandedFolderIds={expandedFolderIds}
              onFolderPress={handleFolderPress}
              onDeleteFolder={handleDeleteFolder}
              onToggleExpanded={handleToggleExpanded}
              onReorder={handleReorder}
              ListEmptyComponent={renderEmptyComponent()}
            />
          </ScrollView>
        )}

        {!isEditMode && (
          <>
            <SearchBar
              onPress={handleSearchPress}
              placeholder="Search"
            />
            <ComposeButton onPress={handleComposePress} />
          </>
        )}

        <UnifiedSearchOverlay
          visible={showSearchOverlay}
          onClose={() => setShowSearchOverlay(false)}
          onSelectFolder={handleSearchSelectFolder}
          onSelectNote={handleSearchSelectNote}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NotesColors.background },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 34, fontWeight: '700', color: NotesColors.textPrimary },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { padding: 4 },
  addFolderIcon: { position: 'relative' },
  addBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    backgroundColor: NotesColors.primary,
    borderRadius: 6,
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: { padding: 4 },
  editText: { fontSize: 17, color: NotesColors.primary },
  doneText: { fontSize: 17, fontWeight: '600', color: NotesColors.primary },
  header: { marginBottom: 8 },
  signInBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(98, 69, 135, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  signInBannerText: { flex: 1, fontSize: 14, color: NotesColors.textPrimary },
  listContent: { paddingBottom: 120 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: { fontSize: 17, color: NotesColors.textSecondary },
});
