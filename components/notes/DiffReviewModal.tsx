/**
 * DiffReviewModal - Shows inline diff after AI re-synthesis
 * so the user can accept or discard the result.
 *
 * Uses Apple Notes-style inline diff: added text gets a green background,
 * removed text gets a red background with line-through, and unchanged
 * text renders normally.
 */
import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { computeWordDiff, DiffSegment } from '@/utils/diffUtils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DiffReviewModalProps {
  visible: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  diff: {
    oldText: string;
    newText: string;
    what_removed: string | null;
  } | null;
  isLoading?: boolean;
}

export function DiffReviewModal({
  visible,
  onAccept,
  onDiscard,
  diff,
  isLoading = false,
}: DiffReviewModalProps) {
  const insets = useSafeAreaInsets();

  const segments: DiffSegment[] = useMemo(() => {
    if (!diff) return [];
    return computeWordDiff(diff.oldText, diff.newText);
  }, [diff]);

  const hasTextChanges = useMemo(() => {
    return segments.some((s) => s.type === 'added' || s.type === 'removed');
  }, [segments]);

  const hasWhatRemoved = Boolean(diff?.what_removed);

  // Block Accept if there are no text changes AND no what_removed info
  const hasChanges = hasTextChanges || hasWhatRemoved;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDiscard}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onDiscard} />

      {/* Sheet */}
      <View style={styles.sheetContainer}>
        <View
          style={[
            styles.sheet,
            {
              maxHeight: SCREEN_HEIGHT * 0.85,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={onDiscard}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.discardText,
                  isLoading && styles.headerButtonDisabled,
                ]}
              >
                Discard
              </Text>
            </TouchableOpacity>

            <Text style={styles.title}>Review Changes</Text>

            <TouchableOpacity
              style={styles.headerButton}
              onPress={onAccept}
              disabled={isLoading || !hasChanges}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.acceptText,
                  (isLoading || !hasChanges) && styles.headerButtonDisabled,
                ]}
              >
                Accept
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider below header */}
          <View style={styles.headerDivider} />

          {isLoading ? (
            /* Loading state */
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={NotesColors.primary} />
              <Text style={styles.loadingText}>Synthesizing...</Text>
            </View>
          ) : !hasChanges ? (
            /* No changes */
            <View style={styles.emptyContainer}>
              <Ionicons
                name="checkmark-circle-outline"
                size={48}
                color={NotesColors.textSecondary}
              />
              <Text style={styles.emptyText}>No changes detected.</Text>
            </View>
          ) : (
            /* Diff content */
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces
            >
              {/* What was removed banner */}
              {hasWhatRemoved && (
                <View style={styles.whatRemovedBanner}>
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color="#DC2626"
                    style={styles.whatRemovedIcon}
                  />
                  <Text style={styles.whatRemovedText}>
                    {diff!.what_removed}
                  </Text>
                </View>
              )}

              {/* Inline diff display */}
              {hasTextChanges && (
                <View style={styles.inlineDiffContainer}>
                  <Text style={styles.inlineDiffText}>
                    {segments.map((segment, index) => {
                      switch (segment.type) {
                        case 'added':
                          return (
                            <Text key={index} style={styles.segmentAdded}>
                              {segment.text}
                            </Text>
                          );
                        case 'removed':
                          return (
                            <Text key={index} style={styles.segmentRemoved}>
                              {segment.text}
                            </Text>
                          );
                        case 'unchanged':
                        default:
                          return (
                            <Text key={index} style={styles.segmentUnchanged}>
                              {segment.text}
                            </Text>
                          );
                      }
                    })}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: NotesColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerButton: {
    minWidth: 60,
  },
  discardText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '600',
    color: NotesColors.primary,
    textAlign: 'right',
  },
  headerButtonDisabled: {
    opacity: 0.4,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    textAlign: 'center',
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: NotesColors.border,
    marginHorizontal: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  /* What was removed banner */
  whatRemovedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    padding: 12,
    marginBottom: 16,
  },
  whatRemovedIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  whatRemovedText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#991B1B',
    fontWeight: '500',
  },

  /* Inline diff */
  inlineDiffContainer: {
    backgroundColor: NotesColors.background,
    borderRadius: 10,
    padding: 14,
  },
  inlineDiffText: {
    fontSize: 15,
    lineHeight: 24,
    color: NotesColors.textPrimary,
  },
  segmentUnchanged: {
    color: NotesColors.textPrimary,
  },
  segmentAdded: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: NotesColors.textPrimary,
  },
  segmentRemoved: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    textDecorationLine: 'line-through',
    opacity: 0.7,
    color: NotesColors.textPrimary,
  },
});

export default DiffReviewModal;
