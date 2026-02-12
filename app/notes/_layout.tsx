import { Stack, useRouter } from 'expo-router';
import { NotesColors } from '@/constants/theme';
import { NotesBackButton } from '@/components/notes/NotesBackButton';

export default function NotesLayout() {
  const router = useRouter();

  const handleBack = () => {
    if (router.canDismiss()) {
      router.dismiss();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/');
    }
  };

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
        headerBackVisible: false,
        headerLeft: () => (
          <NotesBackButton onPress={handleBack} />
        ),
      }}
    >
      <Stack.Screen
        name="[folderId]"
        options={{
          headerLargeTitle: true,
          headerLargeTitleStyle: {
            color: NotesColors.textPrimary,
          },
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
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="detail/history/[noteId]"
        options={{
          title: 'Version History',
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
