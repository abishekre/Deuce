import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { startAuth } from '@/auth/session';
import { useTheme } from '@/design/theme';

export default function RootLayout() {
  const theme = useTheme();

  useEffect(() => {
    startAuth();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />
    </>
  );
}
