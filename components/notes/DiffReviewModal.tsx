/**
 * DiffReviewModal - Shows added/removed changes after AI re-synthesis
 * so the user can accept or discard the result.
 */
import React from 'react';
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DiffReviewModalProps {
  visible: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  diff: {
    added: string[];
    removed: string[];
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

  const hasChanges =
    diff !== null && (diff.added.length > 0 || diff.removed.length > 0);

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
              {/* Added section */}
              {diff!.added.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="add-circle"
                      size={20}
                      color="#10B981"
                    />
                    <Text style={styles.sectionTitleAdded}>Added</Text>
                  </View>
                  {diff!.added.map((item, index) => (
                    <View key={`added-${index}`} style={styles.addedCard}>
                      <Text style={styles.addedText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Removed section */}
              {diff!.removed.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="remove-circle"
                      size={20}
                      color="#EF4444"
                    />
                    <Text style={styles.sectionTitleRemoved}>Removed</Text>
                  </View>
                  {diff!.removed.map((item, index) => (
                    <View key={`removed-${index}`} style={styles.removedCard}>
                      <Text style={styles.removedText}>{item}</Text>
                    </View>
                  ))}
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
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleAdded: {
    fontSize: 15,
    fontWeight: '600',
    color: '#065F46',
  },
  sectionTitleRemoved: {
    fontSize: 15,
    fontWeight: '600',
    color: '#991B1B',
  },
  addedCard: {
    backgroundColor: '#ECFDF5',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  addedText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#065F46',
  },
  removedCard: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  removedText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#991B1B',
    textDecorationLine: 'line-through',
  },
});

export default DiffReviewModal;
