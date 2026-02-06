import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { NoteActions, CalendarAction, EmailAction, ReminderAction } from '@/data/types';

interface ExtendedCalendarAction extends Omit<CalendarAction, 'status'> {
  status?: string;
}

interface ExtendedEmailAction extends Omit<EmailAction, 'status'> {
  status?: string;
}

interface ExtendedReminderAction extends Omit<ReminderAction, 'status'> {
  status?: string;
}

interface ExtendedNoteActions {
  calendar: ExtendedCalendarAction[];
  email: ExtendedEmailAction[];
  reminders: ExtendedReminderAction[];
  nextSteps: string[];
}

interface AISummaryPanelProps {
  actions: NoteActions | ExtendedNoteActions;
  onViewDraft?: (emailId: string) => void;
  onExecuteAction?: (actionId: string, service: 'google' | 'apple') => void;
  onCompleteAction?: (actionId: string) => void;
  embedded?: boolean; // When true, removes container styling (used inside FloatingActionBar)
}

export function AISummaryPanel({ actions, onViewDraft, onExecuteAction, onCompleteAction, embedded = false }: AISummaryPanelProps) {
  const hasAnyActions =
    actions.calendar.length > 0 ||
    actions.email.length > 0 ||
    actions.reminders.length > 0 ||
    actions.nextSteps.length > 0;

  if (!hasAnyActions) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const renderCalendarItem = (item: ExtendedCalendarAction) => (
    <View key={item.id} style={styles.actionItem}>
      <View style={styles.actionIconContainer}>
        <Ionicons name="calendar" size={16} color={NotesColors.calendarBadge} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{item.title}</Text>
        <Text style={styles.actionSubtitle}>
          {formatDate(item.date)} {item.time && `at ${item.time}`}
        </Text>
        {item.status === 'completed' || item.status === 'created' ? (
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
            <Text style={styles.statusText}>Added to Calendar</Text>
          </View>
        ) : item.status === 'pending' && onExecuteAction ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.executeButton}
              onPress={() => onExecuteAction(item.id, 'google')}
            >
              <Ionicons name="logo-google" size={14} color={NotesColors.textPrimary} />
              <Text style={styles.executeButtonText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.executeButton}
              onPress={() => onExecuteAction(item.id, 'apple')}
            >
              <Ionicons name="logo-apple" size={14} color={NotesColors.textPrimary} />
              <Text style={styles.executeButtonText}>Apple</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );

  const renderEmailItem = (item: ExtendedEmailAction) => (
    <View key={item.id} style={styles.actionItem}>
      <View style={styles.actionIconContainer}>
        <Ionicons name="mail" size={16} color={NotesColors.emailBadge} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>To: {item.to}</Text>
        <Text style={styles.actionSubtitle} numberOfLines={1}>
          {item.subject}
        </Text>
        {'preview' in item && item.preview && (
          <Text style={styles.emailPreview} numberOfLines={2}>
            {item.preview}
          </Text>
        )}
        {item.status === 'sent' ? (
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
            <Text style={styles.statusText}>Sent</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.viewDraftButton}
            onPress={() => onViewDraft?.(item.id)}
          >
            <Text style={styles.viewDraftText}>View Draft</Text>
            <Ionicons name="arrow-forward" size={14} color={NotesColors.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderReminderItem = (item: ExtendedReminderAction) => (
    <View key={item.id} style={styles.actionItem}>
      <View style={styles.actionIconContainer}>
        <Ionicons name="alarm" size={16} color={NotesColors.reminderBadge} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{item.title}</Text>
        <Text style={styles.actionSubtitle}>
          Due: {formatDate(item.dueDate)} {'dueTime' in item && item.dueTime && `at ${item.dueTime}`}
        </Text>
        {'priority' in item && item.priority && (
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
            <Text style={styles.priorityText}>{String(item.priority).toUpperCase()}</Text>
          </View>
        )}
        {item.status === 'completed' ? (
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
            <Text style={styles.statusText}>Completed</Text>
          </View>
        ) : item.status === 'pending' && onExecuteAction ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.executeButton}
              onPress={() => onExecuteAction(item.id, 'apple')}
            >
              <Ionicons name="notifications-outline" size={14} color={NotesColors.textPrimary} />
              <Text style={styles.executeButtonText}>Add Reminder</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );

  const renderNextStep = (step: string, index: number) => (
    <View key={index} style={styles.nextStepItem}>
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => onCompleteAction?.(`next-step-${index}`)}
      >
        <Ionicons name="square-outline" size={18} color={NotesColors.textSecondary} />
      </TouchableOpacity>
      <Text style={styles.nextStepText}>{step}</Text>
    </View>
  );

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'rgba(239, 83, 80, 0.3)';
      case 'medium':
        return 'rgba(255, 167, 38, 0.3)';
      default:
        return 'rgba(102, 187, 106, 0.3)';
    }
  };

  return (
    <View style={embedded ? styles.embeddedContainer : styles.container}>
      {!embedded && (
        <View style={styles.header}>
          <Text style={styles.sparkle}>✨</Text>
          <Text style={styles.headerTitle}>Actions Taken</Text>
        </View>
      )}

      {actions.calendar.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calendar Events</Text>
          {actions.calendar.map(renderCalendarItem)}
        </View>
      )}

      {actions.email.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Drafts</Text>
          {actions.email.map(renderEmailItem)}
        </View>
      )}

      {actions.reminders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminders</Text>
          {actions.reminders.map(renderReminderItem)}
        </View>
      )}

      {actions.nextSteps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Steps</Text>
          <View style={styles.nextStepsList}>
            {actions.nextSteps.map(renderNextStep)}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: NotesColors.aiPanelBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: NotesColors.aiPanelBorder,
    padding: 16,
    marginBottom: 20,
  },
  embeddedContainer: {
    // No background, border, or padding when embedded in FloatingActionBar
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sparkle: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NotesColors.textPrimary,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: NotesColors.aiPanelBorder,
  },
  actionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'NotesColors.aiPanelBackground',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: NotesColors.textSecondary,
    marginBottom: 4,
  },
  emailPreview: {
    fontSize: 13,
    color: NotesColors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  executeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'NotesColors.aiPanelBorder',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  executeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  viewDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDraftText: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.accent,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    color: NotesColors.textPrimary,
  },
  nextStepsList: {
    gap: 8,
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    marginTop: 2,
  },
  nextStepText: {
    flex: 1,
    fontSize: 15,
    color: NotesColors.textPrimary,
    lineHeight: 22,
  },
});
