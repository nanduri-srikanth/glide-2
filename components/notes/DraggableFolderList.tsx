import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { SwipeableFolderCard } from './SwipeableFolderCard';
import { Folder } from '@/data/types';
import { NotesColors } from '@/constants/theme';
import { FolderReorderItem } from '@/services/notes';

interface DraggableFolderListProps {
  folders: Folder[];
  isEditMode: boolean;
  isLoading?: boolean;
  expandedFolderIds: Set<string>;
  onFolderPress: (folder: Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onToggleExpanded: (folderId: string) => void;
  onReorder: (updates: FolderReorderItem[]) => Promise<boolean>;
  ListHeaderComponent?: React.ReactElement;
  ListEmptyComponent?: React.ReactElement;
}

interface FlattenedFolder extends Folder {
  originalIndex: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

const MAX_DEPTH = 2;
const NEST_HOLD_DURATION = 500;

export function DraggableFolderList({
  folders,
  isEditMode,
  isLoading = false,
  expandedFolderIds,
  onFolderPress,
  onDeleteFolder,
  onToggleExpanded,
  onReorder,
  ListHeaderComponent,
  ListEmptyComponent,
}: DraggableFolderListProps) {
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flatten the tree structure for display
  const flattenTree = useCallback((
    items: Folder[],
    depth: number = 0,
    originalIndex: number = 0
  ): FlattenedFolder[] => {
    const result: FlattenedFolder[] = [];

    for (const folder of items) {
      const hasChildren = (folder.children?.length ?? 0) > 0;
      const isExpanded = expandedFolderIds.has(folder.id);

      result.push({
        ...folder,
        depth,
        originalIndex: originalIndex++,
        hasChildren,
        isExpanded,
      });

      // Add children if expanded
      if (hasChildren && isExpanded && folder.children) {
        const childItems = flattenTree(folder.children, depth + 1, originalIndex);
        result.push(...childItems);
        originalIndex += childItems.length;
      }
    }

    return result;
  }, [expandedFolderIds]);

  const flattenedFolders = flattenTree(folders);

  // Find folder by id in original tree
  const findFolderInTree = useCallback((
    items: Folder[],
    id: string
  ): Folder | null => {
    for (const folder of items) {
      if (folder.id === id) return folder;
      if (folder.children) {
        const found = findFolderInTree(folder.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Get all folder ids in subtree (for preventing nesting into own children)
  const getSubtreeIds = useCallback((folder: Folder): Set<string> => {
    const ids = new Set<string>([folder.id]);
    if (folder.children) {
      for (const child of folder.children) {
        const childIds = getSubtreeIds(child);
        childIds.forEach(id => ids.add(id));
      }
    }
    return ids;
  }, []);

  // Calculate max depth of a folder's subtree
  const getMaxSubtreeDepth = useCallback((folder: Folder, currentDepth: number = 0): number => {
    if (!folder.children || folder.children.length === 0) {
      return currentDepth;
    }
    let maxDepth = currentDepth;
    for (const child of folder.children) {
      maxDepth = Math.max(maxDepth, getMaxSubtreeDepth(child, currentDepth + 1));
    }
    return maxDepth;
  }, []);

  // Handle drag end - reorder or nest
  const handleDragEnd = useCallback(async ({ data, from, to }: { data: FlattenedFolder[]; from: number; to: number }) => {
    if (from === to) {
      setHoverTargetId(null);
      return;
    }

    const draggedItem = flattenedFolders[from];

    // System folders cannot be moved
    if (draggedItem.isSystem) {
      setHoverTargetId(null);
      return;
    }

    // Build reorder updates
    const updates: FolderReorderItem[] = [];

    // If hovering over a target, nest into it
    if (hoverTargetId) {
      const targetFolder = findFolderInTree(folders, hoverTargetId);

      if (targetFolder) {
        // Validate nesting rules
        const subtreeIds = getSubtreeIds(draggedItem);
        if (subtreeIds.has(hoverTargetId)) {
          // Can't nest into own subtree
          setHoverTargetId(null);
          return;
        }

        if (targetFolder.isSystem) {
          // Can't nest into system folders
          setHoverTargetId(null);
          return;
        }

        // Check depth constraint
        const draggedSubtreeMaxDepth = getMaxSubtreeDepth(draggedItem);
        const draggedRelativeDepth = draggedSubtreeMaxDepth - draggedItem.depth;
        const newDepth = (targetFolder.depth || 0) + 1;

        if (newDepth + draggedRelativeDepth > MAX_DEPTH) {
          // Would exceed max depth
          setHoverTargetId(null);
          return;
        }

        // Nest the folder
        updates.push({
          id: draggedItem.id,
          sort_order: 0,
          parent_id: hoverTargetId,
        });
      }
    } else {
      // Simple reorder at same level
      const targetItem = data[to];
      const sameLevel = draggedItem.parentId === targetItem?.parentId;

      if (sameLevel) {
        // Reorder within same parent
        const siblings = data.filter(f => f.parentId === draggedItem.parentId);
        siblings.forEach((folder, index) => {
          updates.push({
            id: folder.id,
            sort_order: index,
            parent_id: folder.parentId || null,
          });
        });
      } else {
        // Moving to different level - check if we should unnest
        if (targetItem && !targetItem.isSystem) {
          const newParentId = targetItem.parentId;
          const targetDepth = targetItem.depth;

          // Check depth constraint for moving
          const draggedSubtreeMaxDepth = getMaxSubtreeDepth(draggedItem);
          const draggedRelativeDepth = draggedSubtreeMaxDepth - draggedItem.depth;

          if (targetDepth + draggedRelativeDepth <= MAX_DEPTH) {
            updates.push({
              id: draggedItem.id,
              sort_order: to,
              parent_id: newParentId || null,
            });
          }
        }
      }
    }

    setHoverTargetId(null);

    if (updates.length > 0) {
      await onReorder(updates);
    }
  }, [flattenedFolders, folders, hoverTargetId, findFolderInTree, getSubtreeIds, getMaxSubtreeDepth, onReorder]);

  // Handle drag over - for nesting detection
  const handleDragOver = useCallback((draggedId: string, targetId: string | null) => {
    if (!targetId || draggedId === targetId) {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setHoverTargetId(null);
      return;
    }

    const targetFolder = findFolderInTree(folders, targetId);
    const draggedFolder = findFolderInTree(folders, draggedId);

    if (!targetFolder || !draggedFolder) return;

    // Check if we can nest
    if (targetFolder.isSystem) return;
    if (getSubtreeIds(draggedFolder).has(targetId)) return;

    // Start timer for nesting
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }

    hoverTimerRef.current = setTimeout(() => {
      setHoverTargetId(targetId);
    }, NEST_HOLD_DURATION);
  }, [folders, findFolderInTree, getSubtreeIds]);

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<FlattenedFolder>) => {
    return (
      <ScaleDecorator>
        <SwipeableFolderCard
          folder={item}
          onPress={() => onFolderPress(item)}
          onDelete={onDeleteFolder}
          isEditMode={isEditMode}
          isSystem={item.isSystem}
          depth={item.depth}
          hasChildren={item.hasChildren}
          isExpanded={item.isExpanded}
          onToggleExpanded={() => onToggleExpanded(item.id)}
          drag={drag}
          isActive={isActive}
        />
      </ScaleDecorator>
    );
  }, [isEditMode, onFolderPress, onDeleteFolder, onToggleExpanded]);

  if (isLoading && flattenedFolders.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={NotesColors.primary} />
      </View>
    );
  }

  if (isEditMode) {
    return (
      <DraggableFlatList
        data={flattenedFolders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onDragEnd={handleDragEnd}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        activationDistance={10}
      />
    );
  }

  // Non-edit mode - use regular map for rendering (no FlatList to avoid VirtualizedList nesting)
  return (
    <View style={styles.nonEditContent}>
      {flattenedFolders.length === 0 ? (
        ListEmptyComponent
      ) : (
        flattenedFolders.map((item) => (
          <SwipeableFolderCard
            key={item.id}
            folder={item}
            onPress={() => onFolderPress(item)}
            onDelete={onDeleteFolder}
            isEditMode={false}
            isSystem={item.isSystem}
            depth={item.depth}
            hasChildren={item.hasChildren}
            isExpanded={item.isExpanded}
            onToggleExpanded={() => onToggleExpanded(item.id)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  nonEditContent: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
