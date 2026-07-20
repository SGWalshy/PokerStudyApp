import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DismissKeyboardView } from '@/components/dismiss-keyboard-view';
import { Colors } from '@/constants/theme';
import { AppDataProvider } from '@/state/app-data';

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.tint,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.backgroundElement,
    notification: Colors.light.tint,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={AppTheme}>
      <AppDataProvider>
        <AnimatedSplashOverlay />
        <DismissKeyboardView>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
          </Stack>
        </DismissKeyboardView>
      </AppDataProvider>
    </ThemeProvider>
  );
}
