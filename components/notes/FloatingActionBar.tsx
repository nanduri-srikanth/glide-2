import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ActionCounts {
  calendar: number;
  email: number;
  reminders: number;
}

interface FloatingActionBarProps {
  counts: ActionCounts;
  isExpanded: boolean;
  onToggleExpand: () => void;
  children?: React.ReactNode; // Expanded content (action cards)
}

export function FloatingActionBar({
  counts,
  isExpanded,
  onToggleExpand,
  children,
}: FloatingActionBarProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const totalActions = counts.calendar + counts.email + counts.reminders;

  // Animate chevron rotation
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpand();
  };

  if (totalActions === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Collapsed Bar - Always visible */}
      <TouchableOpacity
        style={styles.collapsedBar}
        onPress={handleToggle}
        activeOpacity={0.7}
      >
        <View style={styles.badgesContainer}>
          {counts.calendar > 0 && (
            <View style={styles.badge}>
              <Ionicons name="calendar" size={14} color={NotesColors.calendarBadge} />
              <Text style={styles.badgeCount}>{counts.calendar}</Text>
            </View>
          )}
          {counts.email > 0 && (
            <View style={styles.badge}>
              <Ionicons name="mail" size={14} color={NotesColors.emailBadge} />
              <Text style={styles.badgeCount}>{counts.email}</Text>
            </View>
          )}
          {counts.reminders > 0 && (
            <View style={styles.badge}>
              <Ionicons name="alarm" size={14} color={NotesColors.reminderBadge} />
              <Text style={styles.badgeCount}>{counts.reminders}</Text>
            </View>
          )}
        </View>

        <View style={styles.expandButton}>
          <Text style={styles.expandText}>
            {isExpanded ? 'Hide' : 'Actions'}
          </Text>
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons name="chevron-down" size={16} color={NotesColors.textSecondary} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: NotesColors.card,
    overflow: 'hidden',
  },
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeCount: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

export default FloatingActionBar;
