import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { EditableActionCard } from './EditableActionCard';
import {
  CalendarAction,
  EmailAction,
  ReminderAction,
  EditableAction,
} from '@/data/types';

interface EditableActionsPanelProps {
  calendarActions: CalendarAction[];
  emailActions: EmailAction[];
  reminderActions: ReminderAction[];
  onUpdateAction: (action: EditableAction) => void;
  onDeleteAction: (actionId: string) => void;
  onAddAction: (type: 'calendar' | 'email' | 'reminder') => void;
  onExecuteAction?: (actionId: string, service: 'google' | 'apple') => void;
}

export function EditableActionsPanel({
  calendarActions,
  emailActions,
  reminderActions,
  onUpdateAction,
  onDeleteAction,
  onAddAction,
  onExecuteAction,
}: EditableActionsPanelProps) {
  const hasCalendar = calendarActions.length > 0;
  const hasEmail = emailActions.length > 0;
  const hasReminder = reminderActions.length > 0;

  return (
    <View style={styles.container}>
      {/* Calendar Events */}
      {hasCalendar && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={14} color={NotesColors.calendarBadge} />
            <Text style={styles.sectionTitle}>Calendar Events</Text>
          </View>
          {calendarActions.filter(a => !a.isDeleted).map((action) => (
            <EditableActionCard
              key={action.id}
              action={action}
              type="calendar"
              onUpdate={onUpdateAction}
              onDelete={onDeleteAction}
              onExecute={onExecuteAction}
            />
          ))}
        </View>
      )}

      {/* Email Drafts */}
      {hasEmail && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mail" size={14} color={NotesColors.emailBadge} />
            <Text style={styles.sectionTitle}>Email Drafts</Text>
          </View>
          {emailActions.filter(a => !a.isDeleted).map((action) => (
            <EditableActionCard
              key={action.id}
              action={action}
              type="email"
              onUpdate={onUpdateAction}
              onDelete={onDeleteAction}
              onExecute={onExecuteAction}
            />
          ))}
        </View>
      )}

      {/* Reminders */}
      {hasReminder && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alarm" size={14} color={NotesColors.reminderBadge} />
            <Text style={styles.sectionTitle}>Reminders</Text>
          </View>
          {reminderActions.filter(a => !a.isDeleted).map((action) => (
            <EditableActionCard
              key={action.id}
              action={action}
              type="reminder"
              onUpdate={onUpdateAction}
              onDelete={onDeleteAction}
              onExecute={onExecuteAction}
            />
          ))}
        </View>
      )}

      {/* Add Action Button */}
      <View style={styles.addActionContainer}>
        <Text style={styles.addActionLabel}>Add Action:</Text>
        <View style={styles.addButtonsRow}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => onAddAction('calendar')}
          >
            <Ionicons name="calendar-outline" size={16} color={NotesColors.calendarBadge} />
            <Text style={[styles.addButtonText, { color: NotesColors.calendarBadge }]}>Event</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => onAddAction('email')}
          >
            <Ionicons name="mail-outline" size={16} color={NotesColors.emailBadge} />
            <Text style={[styles.addButtonText, { color: NotesColors.emailBadge }]}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => onAddAction('reminder')}
          >
            <Ionicons name="alarm-outline" size={16} color={NotesColors.reminderBadge} />
            <Text style={[styles.addButtonText, { color: NotesColors.reminderBadge }]}>Reminder</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  section: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addActionContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 12,
  },
  addActionLabel: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    marginBottom: 8,
  },
  addButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addButtonText: {
    fontSize: 12,
    color: NotesColors.primary,
  },
});

export default EditableActionsPanel;
