import { Stack } from 'expo-router';
import { NotesColors } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: NotesColors.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
