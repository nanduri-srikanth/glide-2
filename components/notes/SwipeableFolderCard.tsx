import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { Folder } from '@/data/types';

const INDENT_PER_LEVEL = 24;

interface SwipeableFolderCardProps {
  folder: Folder;
  onPress: () => void;
  onDelete: (folderId: string) => void;
  isEditMode: boolean;
  isSystem?: boolean;
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  drag?: () => void;
  isActive?: boolean;
}

export function SwipeableFolderCard({
  folder,
  onPress,
  onDelete,
  isEditMode,
  isSystem = false,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpanded,
  drag,
  isActive = false,
}: SwipeableFolderCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const getIconName = (icon: string): keyof typeof Ionicons.glyphMap => {
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      'folder.fill': 'folder',
      'folder': 'folder',
      'trash.fill': 'trash',
      'lightbulb.fill': 'bulb',
      'lightbulb': 'bulb',
      'person.2.fill': 'people',
      'person': 'person',
      'briefcase': 'briefcase',
    };
    return iconMap[icon] || 'folder';
  };

  const handleDelete = () => {
    if (isSystem) {
      Alert.alert('Cannot Delete', 'System folders cannot be deleted.');
      return;
    }

    Alert.alert(
      'Delete Folder',
      `Are you sure you want to delete "${folder.name}"?${hasChildren ? ' All subfolders will also be deleted.' : ''} Notes in this folder will be moved to All Notes.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => swipeableRef.current?.close(),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            swipeableRef.current?.close();
            onDelete(folder.id);
          },
        },
      ]
    );
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (isSystem) return null;

    const opacity = dragX.interpolate({
      inputRange: [-80, -40, 0],
      outputRange: [1, 0.5, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.deleteContainer, { opacity }]}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const indentStyle = { marginLeft: depth * INDENT_PER_LEVEL };

  const cardContent = (
    <View style={styles.cardInner}>
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
        {hasChildren && (
          <TouchableOpacity
            onPress={onToggleExpanded}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.expandButton}
          >
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={NotesColors.textSecondary}
            />
          </TouchableOpacity>
        )}
        <Text style={styles.count}>{folder.noteCount}</Text>
        {!isEditMode && !hasChildren && (
          <Ionicons name="chevron-forward" size={20} color={NotesColors.textSecondary} />
        )}
      </View>
    </View>
  );

  if (isEditMode) {
    return (
      <View
        style={[
          styles.editModeContainer,
          indentStyle,
          isActive && styles.dragging,
        ]}
      >
        {!isSystem && (
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.minusButton}
          >
            <View style={styles.minusCircle}>
              <Ionicons name="remove" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.container, styles.editModeCard, isSystem && styles.systemFolder]}
          onPress={onPress}
          activeOpacity={0.7}
          onLongPress={!isSystem ? drag : undefined}
          delayLongPress={150}
        >
          {cardContent}
        </TouchableOpacity>
        {!isSystem && (
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={0}
            style={styles.dragHandle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="menu" size={22} color={NotesColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (isSystem) {
    return (
      <TouchableOpacity
        style={[styles.container, indentStyle]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View style={indentStyle}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
      >
        <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
          {cardContent}
        </TouchableOpacity>
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    marginBottom: 8,
  },
  systemFolder: {
    opacity: 0.7,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  expandButton: {
    padding: 4,
    marginRight: 4,
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
  deleteContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 12,
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  editModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  editModeCard: {
    flex: 1,
    marginBottom: 0,
  },
  minusButton: {
    marginRight: 8,
    zIndex: 1,
  },
  minusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: {
    marginLeft: 8,
    padding: 4,
  },
  dragging: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
