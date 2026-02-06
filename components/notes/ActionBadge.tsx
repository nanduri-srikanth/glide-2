import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { ActionType } from '@/data/types';

interface ActionBadgeProps {
  type: ActionType;
  count?: number;
  showLabel?: boolean;
}

const actionConfig: Record<ActionType, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  calendar: {
    icon: 'calendar',
    color: NotesColors.calendarBadge,
    label: 'Calendar',
  },
  email: {
    icon: 'mail',
    color: NotesColors.emailBadge,
    label: 'Email',
  },
  reminder: {
    icon: 'alarm',
    color: NotesColors.reminderBadge,
    label: 'Reminder',
  },
};

export function ActionBadge({ type, count, showLabel = false }: ActionBadgeProps) {
  const config = actionConfig[type];

  return (
    <View style={[styles.container, { backgroundColor: `${config.color}30` }]}>
      <Ionicons name={config.icon} size={12} color={config.color} />
      {showLabel && <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>}
      {count !== undefined && count > 0 && (
        <Text style={[styles.count, { color: config.color }]}>{count}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  count: {
    fontSize: 11,
    fontWeight: '600',
  },
});
