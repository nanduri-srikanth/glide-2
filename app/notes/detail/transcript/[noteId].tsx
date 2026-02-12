import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { noteInputsRepository } from '@/lib/repositories';
import { notesService } from '@/services/notes';
import type { NoteInputRow } from '@/lib/database/schema';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const INPUT_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 720);

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'audio':
      return 'mic-outline';
    case 'import':
      return 'download-outline';
    default:
      return 'create-outline';
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'audio':
      return '#FF3B30';
    case 'import':
      return '#34C759';
    default:
      return NotesColors.primary;
  }
}

function getTypeBackgroundColor(type: string): string {
  switch (type) {
    case 'audio':
      return 'rgba(255, 59, 48, 0.12)';
    case 'import':
      return 'rgba(52, 199, 89, 0.12)';
    default:
      return 'rgba(139, 133, 208, 0.15)';
  }
}

function getPreviewText(input: NoteInputRow): string {
  if (input.text_plain && input.text_plain.trim().length > 0) return input.text_plain.trim();
  if (input.type === 'audio') return 'Audio input';
  return 'No text content available';
}

function TranscriptInputSheet({
  input,
  visible,
  onClose,
}: {
  input: NoteInputRow | null;
  visible: boolean;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(INPUT_SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!input) return;

    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: false,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: INPUT_SHEET_HEIGHT,
          duration: 220,
          useNativeDriver: false,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [visible, input, slideAnim, backdropOpacity]);

  if (!input) return null;

  const contentText = input.text_plain
    ? input.text_plain
    : input.type === 'audio'
      ? 'Audio — transcription included in note body'
      : 'No text content available';

  return (
    <View style={styles.sheetOverlay}>
      <Animated.View
        style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}
      />
      <TouchableOpacity
        style={styles.sheetBackdropTouch}
        onPress={onClose}
        activeOpacity={1}
      />

      <Animated.View
        style={[
          styles.sheet,
          {
            height: INPUT_SHEET_HEIGHT,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.sheetHandleBar} />

        <View style={styles.sheetHeader}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.sheetCloseButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={NotesColors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Input</Text>
          <View style={styles.sheetHeaderPlaceholder} />
        </View>

        <View style={styles.sheetMetaRow}>
          <View
            style={[
              styles.typeIconCircle,
              { backgroundColor: getTypeBackgroundColor(input.type) },
            ]}
          >
            <Ionicons
              name={getTypeIcon(input.type)}
              size={14}
              color={getTypeColor(input.type)}
            />
          </View>

          <View style={styles.sheetMetaText}>
            <Text style={styles.typeLabel}>
              {input.type.charAt(0).toUpperCase() + input.type.slice(1)}
            </Text>
            <Text style={styles.timestamp}>{formatRelativeTime(input.created_at)}</Text>
          </View>

          <View
            style={[
              styles.sourceBadge,
              input.source === 'ai' ? styles.sourceBadgeAi : styles.sourceBadgeUser,
            ]}
          >
            <Text
              style={[
                styles.sourceBadgeText,
                input.source === 'ai'
                  ? styles.sourceBadgeTextAi
                  : styles.sourceBadgeTextUser,
              ]}
            >
              {input.source}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.sheetBody}
          contentContainerStyle={styles.sheetBodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sheetContentText} selectable>
            {contentText}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export default function FullTranscriptScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const [inputs, setInputs] = useState<NoteInputRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fromServer, setFromServer] = useState(false);
  const [selectedInput, setSelectedInput] = useState<NoteInputRow | null>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const clearSelectedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openInput = useCallback((input: NoteInputRow) => {
    if (clearSelectedTimer.current) {
      clearTimeout(clearSelectedTimer.current);
      clearSelectedTimer.current = null;
    }
    setSelectedInput(input);
    setIsSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setIsSheetVisible(false);
    if (clearSelectedTimer.current) clearTimeout(clearSelectedTimer.current);
    clearSelectedTimer.current = setTimeout(() => {
      setSelectedInput(null);
      clearSelectedTimer.current = null;
    }, 240);
  }, []);

  useEffect(() => {
    if (!noteId) return;

    let cancelled = false;

    async function loadInputs() {
      try {
        const rows = await noteInputsRepository.getAllForNote(noteId!);
        if (!cancelled) {
          setInputs(rows);
        }

        // If local SQLite is empty, try fetching from server as fallback
        if (rows.length === 0) {
          try {
            const { data } = await notesService.getNote(noteId!);
            if (data?.ai_metadata?.input_history && data.ai_metadata.input_history.length > 0) {
              const serverInputs: NoteInputRow[] = data.ai_metadata.input_history.map((entry: any, idx: number) => ({
                id: `server_${idx}`,
                note_id: noteId!,
                created_at: entry.timestamp || new Date().toISOString(),
                type: entry.type || 'text',
                source: 'user',
                text_plain: entry.content || null,
                audio_url: entry.audio_key || null,
                meta: entry.duration != null ? JSON.stringify({ duration: entry.duration }) : null,
                sync_status: 'synced',
              }));
              if (!cancelled) {
                setInputs(serverInputs);
                setFromServer(true);
              }
            }
          } catch (serverErr) {
            console.warn('Failed to load note inputs from server:', serverErr);
          }
        }
      } catch (err) {
        console.warn('Failed to load note inputs:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadInputs();

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (clearSelectedTimer.current) clearTimeout(clearSelectedTimer.current);
    };
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{ title: 'Full Transcript' }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={NotesColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (inputs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{ title: 'Full Transcript' }}
        />
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={NotesColors.secondary}
            />
          </View>
          <Text style={styles.emptyTitle}>No input history yet.</Text>
          <Text style={styles.emptySubtitle}>
            Inputs will appear here as you add audio, text, or imports to this
            note.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{ title: 'Full Transcript' }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.inputCount}>
          {inputs.length} {inputs.length === 1 ? 'input' : 'inputs'}
        </Text>

        {fromServer && (
          <View style={styles.serverBanner}>
            <Ionicons name="cloud-outline" size={14} color={NotesColors.textSecondary} />
            <Text style={styles.serverBannerText}>Loaded from server</Text>
          </View>
        )}

        {inputs.map((input) => (
          <TouchableOpacity
            key={input.id}
            style={styles.card}
            onPress={() => openInput(input)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.typeIconCircle,
                  { backgroundColor: getTypeBackgroundColor(input.type) },
                ]}
              >
                <Ionicons
                  name={getTypeIcon(input.type)}
                  size={14}
                  color={getTypeColor(input.type)}
                />
              </View>

              <View style={styles.cardHeaderText}>
                <Text style={styles.typeLabel}>
                  {input.type.charAt(0).toUpperCase() + input.type.slice(1)}
                </Text>
                <Text style={styles.timestamp}>
                  {formatRelativeTime(input.created_at)}
                </Text>
              </View>

              <View
                style={[
                  styles.sourceBadge,
                  input.source === 'ai'
                    ? styles.sourceBadgeAi
                    : styles.sourceBadgeUser,
                ]}
              >
                <Text
                  style={[
                    styles.sourceBadgeText,
                    input.source === 'ai'
                      ? styles.sourceBadgeTextAi
                      : styles.sourceBadgeTextUser,
                  ]}
                >
                  {input.source}
                </Text>
              </View>
            </View>

            <Text
              style={input.text_plain ? styles.previewText : styles.contentPlaceholder}
              numberOfLines={3}
            >
              {getPreviewText(input)}
            </Text>

            <View style={styles.expandAffordanceRow}>
              <Ionicons name="chevron-up" size={14} color={NotesColors.textSecondary} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TranscriptInputSheet
        input={selectedInput}
        visible={isSheetVisible}
        onClose={closeSheet}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: NotesColors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NotesColors.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  inputCount: {
    fontSize: 13,
    fontWeight: '500',
    color: NotesColors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(139, 133, 208, 0.08)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  serverBannerText: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    fontWeight: '500',
  },
  // Card
  card: {
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NotesColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 10,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  timestamp: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    marginTop: 1,
  },
  // Source badge
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sourceBadgeUser: {
    backgroundColor: 'rgba(139, 133, 208, 0.12)',
  },
  sourceBadgeAi: {
    backgroundColor: 'rgba(167, 139, 219, 0.15)',
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sourceBadgeTextUser: {
    color: NotesColors.primary,
  },
  sourceBadgeTextAi: {
    color: NotesColors.accent,
  },
  // Content
  contentText: {
    fontSize: 15,
    lineHeight: 22,
    color: NotesColors.textPrimary,
  },
  previewText: {
    fontSize: 15,
    lineHeight: 22,
    color: NotesColors.textPrimary,
  },
  contentPlaceholder: {
    fontSize: 14,
    fontStyle: 'italic',
    color: NotesColors.textSecondary,
  },

  // Tray sheet
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 0,
  },
  sheetBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  sheet: {
    backgroundColor: NotesColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    zIndex: 2,
  },
  sheetHandleBar: {
    width: 36,
    height: 5,
    backgroundColor: NotesColors.textSecondary,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
    opacity: 0.6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetCloseButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  sheetHeaderPlaceholder: {
    width: 44,
    height: 44,
  },
  sheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  sheetMetaText: {
    flex: 1,
  },
  sheetBody: {
    flex: 1,
  },
  sheetBodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheetContentText: {
    fontSize: 16,
    lineHeight: 24,
    color: NotesColors.textPrimary,
  },
  expandAffordanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
});
