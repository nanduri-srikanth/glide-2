import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';

export default function NotesLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: NotesColors.background,
        },
        headerTintColor: NotesColors.primary,
        headerTitleStyle: {
          fontWeight: '600',
          color: NotesColors.textPrimary,
        },
        contentStyle: {
          backgroundColor: NotesColors.background,
        },
      }}
    >
      <Stack.Screen
        name="[folderId]"
        options={{
          headerLargeTitle: true,
          headerLargeTitleStyle: {
            color: NotesColors.textPrimary,
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (router.canDismiss()) {
                  router.dismiss();
                } else if (router.canGoBack()) {
                  router.back();
                } else {
                  router.navigate('/');
                }
              }}
              style={styles.backButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={26} color={NotesColors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="detail/[noteId]"
        options={{
          title: '',
          headerBackVisible: false,
          headerShadowVisible: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="detail/transcript/[noteId]"
        options={{
          title: 'Full Transcript',
          headerBackVisible: true,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="detail/history/[noteId]"
        options={{
          title: 'Version History',
          headerBackVisible: true,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
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
});
