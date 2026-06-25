import { DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

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

export default function TabLayout() {
  return (
    <ThemeProvider value={AppTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
