import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { NotesColors } from '@/constants/theme';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  const displayName = useMemo(() => {
    return user?.full_name || user?.email || 'Profile';
  }, [user]);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    showArrow?: boolean;
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress} disabled={!onPress}>
      <View style={styles.settingLeft}>
        <Ionicons name={icon as any} size={24} color={NotesColors.primary} />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={20} color={NotesColors.textSecondary} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={26} color={NotesColors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isAuthenticated && (
          <View style={styles.profileSection}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={24} color={NotesColors.textSecondary} />
              </View>
              <View style={styles.profileDetails}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
            </View>

            <View style={styles.profileActions}>
              <SettingItem
                icon="log-out-outline"
                title="Sign Out"
                onPress={handleLogout}
                showArrow={false}
              />
            </View>

            <View style={styles.sectionDivider} />

            <SettingItem
              icon="notifications-outline"
              title="Notifications"
              subtitle="Configure notification settings"
            />
            <SettingItem
              icon="moon-outline"
              title="Appearance"
              subtitle="Dark mode, themes"
            />
            <SettingItem
              icon="text-outline"
              title="Language"
              subtitle="English (US)"
            />
            <SettingItem
              icon="cloud-outline"
              title="Sync"
              subtitle="Last synced: Just now"
            />
            <SettingItem
              icon="trash-outline"
              title="Clear Cache"
              subtitle="Free up storage space"
            />
            <SettingItem
              icon="help-circle-outline"
              title="Help Center"
            />
            <SettingItem
              icon="chatbubble-outline"
              title="Send Feedback"
            />
            <SettingItem
              icon="document-text-outline"
              title="Privacy Policy"
            />
            <SettingItem
              icon="information-circle-outline"
              title="About"
              subtitle="Glide v1.0.0"
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTopRow: {
    height: 44,
    justifyContent: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NotesColors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NotesColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: NotesColors.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  profileSection: {
    marginTop: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: NotesColors.border,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: NotesColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: NotesColors.textPrimary,
  },
  profileEmail: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    marginTop: 4,
  },
  profileActions: {
    marginTop: 12,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: NotesColors.border,
    marginVertical: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: NotesColors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  settingSubtitle: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    marginTop: 2,
  },
});
