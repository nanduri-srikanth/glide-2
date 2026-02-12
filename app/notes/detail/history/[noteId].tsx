import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { noteVersionsRepository } from '@/lib/repositories';
import { notesService } from '@/services/notes';
import type { NoteVersionRow } from '@/lib/database/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function dateSectionLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

type KindMeta = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
};

function kindMeta(kind: string): KindMeta {
  switch (kind) {
    case 'synth':
      return { icon: 'sparkles', label: 'AI Synthesis', color: NotesColors.accent };
    case 'manual':
      return { icon: 'create-outline', label: 'Manual Edit', color: NotesColors.primary };
    case 'metadata':
      return { icon: 'pricetag-outline', label: 'Metadata', color: NotesColors.textSecondary };
    default:
      return { icon: 'document-outline', label: kind, color: NotesColors.textSecondary };
  }
}

// ---------------------------------------------------------------------------
// Grouping helper
// ---------------------------------------------------------------------------

type Section = {
  title: string;
  data: NoteVersionRow[];
};

function groupByDate(versions: NoteVersionRow[]): Section[] {
  const map = new Map<string, NoteVersionRow[]>();
  for (const v of versions) {
    const key = dateSectionLabel(v.created_at);
    const arr = map.get(key);
    if (arr) {
      arr.push(v);
    } else {
      map.set(key, [v]);
    }
  }
  const sections: Section[] = [];
  for (const [title, data] of map) {
    sections.push({ title, data });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function VersionHistoryScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();

  const [versions, setVersions] = useState<NoteVersionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Load versions
  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const rows = await noteVersionsRepository.getAllForNote(noteId);
        if (!cancelled) setVersions(rows);
      } catch (err) {
        console.warn('Failed to load versions', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // Toggle expansion
  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Restore a version
  const handleRestore = useCallback(
    (version: NoteVersionRow) => {
      Alert.alert(
        'Restore Version?',
        'This will create a new version with the content from this snapshot. Your current content will be preserved in history.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              if (!noteId) return;
              setIsRestoring(true);
              try {
                // 1. Update the note's actual content on the server
                const { error } = await notesService.updateNote(noteId, {
                  title: version.title || undefined,
                  transcript: version.body_plain || undefined,
                });
                if (error) {
                  throw new Error(error);
                }

                // 2. Create a new version entry as an audit trail
                await noteVersionsRepository.create({
                  note_id: noteId,
                  kind: 'manual',
                  actor: 'user',
                  title: version.title,
                  body_plain: version.body_plain,
                  body_rtf_base64: version.body_rtf_base64,
                  summary_plain: version.summary_plain,
                  actions_json: version.actions_json,
                  what_removed: null,
                  parent_version_id: version.id,
                });

                // 3. Navigate back
                router.back();
              } catch (err) {
                console.warn('Failed to restore version', err);
                Alert.alert('Error', 'Could not restore version. Please try again.');
              } finally {
                setIsRestoring(false);
              }
            },
          },
        ],
      );
    },
    [noteId, router],
  );

  // Parse actions_json safely
  const parseActions = (actionsJson: unknown): string[] => {
    if (!actionsJson) return [];
    try {
      const parsed = typeof actionsJson === 'string' ? JSON.parse(actionsJson) : actionsJson;
      if (Array.isArray(parsed)) {
        return parsed.map((a: any) => a.title || a.action_type || String(a));
      }
      return [];
    } catch {
      return [];
    }
  };

  // Sections for the list
  const sections = groupByDate(versions);

  // Determine if a version is the newest (current)
  const newestId = versions.length > 0 ? versions[0].id : null;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  const renderItem = ({ item, index }: { item: NoteVersionRow; index: number }) => {
    const meta = kindMeta(item.kind);
    const isCurrent = item.id === newestId;
    const isExpanded = expandedId === item.id;
    const actions = parseActions(item.actions_json);

    return (
      <View style={styles.versionCard}>
        <TouchableOpacity
          style={styles.versionRow}
          onPress={() => handleToggle(item.id)}
          activeOpacity={0.7}
        >
          {/* Left: Icon */}
          <View style={[styles.kindIconContainer, { backgroundColor: meta.color + '20' }]}>
            <Ionicons name={meta.icon} size={18} color={meta.color} />
          </View>

          {/* Center: Info */}
          <View style={styles.versionInfo}>
            {/* Top row: badges + timestamp */}
            <View style={styles.badgeRow}>
              <View style={[styles.kindBadge, { backgroundColor: meta.color + '18' }]}>
                <Text style={[styles.kindBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <View
                style={[
                  styles.actorBadge,
                  item.actor === 'ai' ? styles.actorBadgeAi : styles.actorBadgeUser,
                ]}
              >
                <Text
                  style={[
                    styles.actorBadgeText,
                    item.actor === 'ai' ? styles.actorBadgeTextAi : styles.actorBadgeTextUser,
                  ]}
                >
                  {item.actor}
                </Text>
              </View>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
              <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
            </View>

            {/* Title */}
            <Text style={styles.versionTitle} numberOfLines={1}>
              {item.title || 'Untitled'}
            </Text>

            {/* Summary preview */}
            {item.body_plain ? (
              <Text style={styles.bodyPreview} numberOfLines={2}>
                {item.body_plain.substring(0, 80)}
                {item.body_plain.length > 80 ? '...' : ''}
              </Text>
            ) : null}

            {/* what_removed */}
            {item.what_removed ? (
              <Text style={styles.whatRemoved} numberOfLines={1}>
                Removed: {item.what_removed}
              </Text>
            ) : null}
          </View>

          {/* Right: Chevron */}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={NotesColors.textSecondary}
          />
        </TouchableOpacity>

        {/* Expanded detail */}
        {isExpanded && (
          <View style={styles.expandedContainer}>
            {/* Full body */}
            {item.body_plain ? (
              <View style={styles.expandedSection}>
                <Text style={styles.expandedLabel}>Content</Text>
                <Text style={styles.expandedText}>{item.body_plain}</Text>
              </View>
            ) : null}

            {/* Summary */}
            {item.summary_plain ? (
              <View style={styles.expandedSection}>
                <Text style={styles.expandedLabel}>Summary</Text>
                <Text style={styles.expandedText}>{item.summary_plain}</Text>
              </View>
            ) : null}

            {/* Actions */}
            {actions.length > 0 && (
              <View style={styles.expandedSection}>
                <Text style={styles.expandedLabel}>Actions</Text>
                {actions.map((a, i) => (
                  <View key={i} style={styles.actionItem}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={NotesColors.primary} />
                    <Text style={styles.actionItemText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Restore button (don't show for the current version) */}
            {!isCurrent && (
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={() => handleRestore(item)}
                disabled={isRestoring}
                activeOpacity={0.7}
              >
                {isRestoring ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={18} color="#fff" />
                    <Text style={styles.restoreButtonText}>Restore This Version</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Version History',
          headerShadowVisible: false,
        }}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={NotesColors.primary} />
        </View>
      ) : versions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={48} color={NotesColors.textSecondary} />
          <Text style={styles.emptyText}>No version history yet.</Text>
          <Text style={styles.emptySubtext}>
            Versions are created when you add content or re-synthesize.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Section header
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Version card
  versionCard: {
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NotesColors.border,
    overflow: 'hidden',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },

  // Kind icon
  kindIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },

  // Info
  versionInfo: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kindBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actorBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actorBadgeUser: {
    backgroundColor: 'rgba(139, 133, 208, 0.15)',
  },
  actorBadgeAi: {
    backgroundColor: 'rgba(167, 139, 219, 0.15)',
  },
  actorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  actorBadgeTextUser: {
    color: NotesColors.primary,
  },
  actorBadgeTextAi: {
    color: NotesColors.accent,
  },
  currentBadge: {
    backgroundColor: NotesColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  timestamp: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    marginLeft: 'auto',
  },

  // Title & preview
  versionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  bodyPreview: {
    fontSize: 13,
    color: NotesColors.textSecondary,
    lineHeight: 18,
  },
  whatRemoved: {
    fontSize: 12,
    color: '#FF3B30',
    opacity: 0.75,
    fontStyle: 'italic',
  },

  // Expanded detail
  expandedContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: NotesColors.border,
    padding: 14,
    gap: 16,
    backgroundColor: NotesColors.background,
  },
  expandedSection: {
    gap: 6,
  },
  expandedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expandedText: {
    fontSize: 14,
    color: NotesColors.textPrimary,
    lineHeight: 20,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  actionItemText: {
    fontSize: 14,
    color: NotesColors.textPrimary,
  },

  // Restore button
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: NotesColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
