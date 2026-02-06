import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Alert,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { Note } from '@/data/types';
import { NoteCard } from './NoteCard';

interface SwipeableNoteCardProps {
  note: Note;
  onPress: () => void;
  onDelete: (noteId: string) => void;
  onMove: (noteId: string) => void;
  onPin?: (noteId: string) => void;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (noteId: string) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const ACTION_WIDTH = 80;
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.6; // 60% of screen = full swipe delete

export function SwipeableNoteCard({
  note,
  onPress,
  onDelete,
  onMove,
  onPin,
  isEditMode,
  isSelected,
  onSelect,
}: SwipeableNoteCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const [showMenu, setShowMenu] = useState(false);
  const minusScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isEditMode) {
      Animated.spring(minusScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(minusScaleAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [isEditMode]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete "${note.title}"?`,
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
            onDelete(note.id);
          },
        },
      ]
    );
  }, [note.id, note.title, onDelete]);

  const handleMove = useCallback(() => {
    swipeableRef.current?.close();
    onMove(note.id);
  }, [note.id, onMove]);

  const handleLongPress = useCallback(() => {
    setShowMenu(true);
  }, []);

  const handleMenuOption = useCallback((action: string) => {
    setShowMenu(false);
    switch (action) {
      case 'delete':
        handleDelete();
        break;
      case 'move':
        onMove(note.id);
        break;
      case 'pin':
        onPin?.(note.id);
        break;
    }
  }, [handleDelete, note.id, onMove, onPin]);

  const handlePin = useCallback(() => {
    swipeableRef.current?.close();
    onPin?.(note.id);
  }, [note.id, onPin]);

  const renderLeftActions = useCallback((
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onPin) return null;

    const scale = dragX.interpolate({
      inputRange: [0, ACTION_WIDTH],
      outputRange: [0.8, 1],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [0, ACTION_WIDTH / 2, ACTION_WIDTH],
      outputRange: [0, 0.5, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.pinActionContainer, { opacity }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity style={styles.pinButton} onPress={handlePin}>
            <Ionicons
              name={note.isPinned ? "pin-outline" : "pin"}
              size={22}
              color="#fff"
            />
            <Text style={styles.actionText}>
              {note.isPinned ? 'Unpin' : 'Pin'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    );
  }, [handlePin, note.isPinned, onPin]);

  const renderRightActions = useCallback((
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    // Scale animation for delete button when swiping far
    const scale = dragX.interpolate({
      inputRange: [-FULL_SWIPE_THRESHOLD, -ACTION_WIDTH * 2, 0],
      outputRange: [1.2, 1, 0.8],
      extrapolate: 'clamp',
    });

    // Opacity for "swipe more" hint
    const hintOpacity = dragX.interpolate({
      inputRange: [-FULL_SWIPE_THRESHOLD, -ACTION_WIDTH * 2.5, -ACTION_WIDTH * 2],
      outputRange: [1, 0.5, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.actionsContainer}>
        {/* Move button */}
        <TouchableOpacity
          style={styles.moveButton}
          onPress={handleMove}
        >
          <Ionicons name="folder-outline" size={22} color="#fff" />
          <Text style={styles.actionText}>Move</Text>
        </TouchableOpacity>

        {/* Delete button */}
        <Animated.View style={[styles.deleteButton, { transform: [{ scale }] }]}>
          <TouchableOpacity
            style={styles.deleteButtonInner}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Full swipe hint */}
        <Animated.View style={[styles.fullSwipeHint, { opacity: hintOpacity }]}>
          <Ionicons name="arrow-back" size={16} color="#fff" />
          <Text style={styles.fullSwipeText}>Swipe to delete</Text>
        </Animated.View>
      </View>
    );
  }, [handleDelete, handleMove]);

  // Handle when swipe completes fully
  const handleSwipeableOpen = useCallback((direction: 'left' | 'right') => {
    // If opened from right swipe, check if it was a full swipe
    // The Swipeable considers it "open" when past the threshold
  }, []);

  // Detect full swipe using onSwipeableWillOpen with custom logic
  const handleSwipeableWillOpen = useCallback((direction: 'left' | 'right') => {
    // This fires when swipe will open
  }, []);

  if (isEditMode) {
    return (
      <View style={styles.editModeContainer}>
        <Animated.View style={[styles.minusButton, { transform: [{ scale: minusScaleAnim }] }]}>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={styles.minusCircle}>
              <Ionicons name="remove" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        </Animated.View>
        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <NoteCard note={note} onPress={onPress} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        renderLeftActions={onPin ? renderLeftActions : undefined}
        renderRightActions={renderRightActions}
        leftThreshold={ACTION_WIDTH}
        rightThreshold={ACTION_WIDTH}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        enableTrackpadTwoFingerGesture
        onSwipeableOpen={handleSwipeableOpen}
      >
        <Pressable onPress={onPress} onLongPress={handleLongPress} delayLongPress={500}>
          <NoteCard note={note} onPress={onPress} />
        </Pressable>
      </Swipeable>

      {/* Context Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle} numberOfLines={1}>{note.title}</Text>

            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => handleMenuOption('move')}
            >
              <Ionicons name="folder-outline" size={22} color={NotesColors.textPrimary} />
              <Text style={styles.menuOptionText}>Move to Folder</Text>
            </TouchableOpacity>

            {onPin && (
              <TouchableOpacity
                style={styles.menuOption}
                onPress={() => handleMenuOption('pin')}
              >
                <Ionicons name="pin-outline" size={22} color={NotesColors.textPrimary} />
                <Text style={styles.menuOptionText}>Pin Note</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => handleMenuOption('delete')}
            >
              <Ionicons name="trash-outline" size={22} color="#FF3B30" />
              <Text style={[styles.menuOptionText, { color: '#FF3B30' }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancelButton}
              onPress={() => setShowMenu(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pinActionContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 10,
    paddingRight: 8,
  },
  pinButton: {
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
    width: ACTION_WIDTH,
    height: '100%',
    borderRadius: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 8,
  },
  moveButton: {
    backgroundColor: NotesColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: ACTION_WIDTH,
    height: '100%',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  deleteButton: {
    height: '100%',
  },
  deleteButtonInner: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: ACTION_WIDTH,
    height: '100%',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  fullSwipeHint: {
    position: 'absolute',
    right: ACTION_WIDTH * 2 + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullSwipeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  editModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
  cardWrapper: {
    flex: 1,
  },
  // Context Menu styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  menuContainer: {
    width: '100%',
    backgroundColor: NotesColors.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: NotesColors.textSecondary,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuOptionText: {
    fontSize: 17,
    color: NotesColors.textPrimary,
  },
  menuCancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuCancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.primary,
  },
});
