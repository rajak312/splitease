import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme } from 'tamagui';

import { tamaguiConfig } from '../../tamagui.config';
import { AuthProvider, useAuth } from '../lib/auth';
import { useAppFonts } from '../lib/fonts';
import { ThemePreferenceProvider } from '../lib/theme-preference';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemePreferenceProvider>
        {(scheme) => (
          <TamaguiProvider config={tamaguiConfig} defaultTheme={scheme}>
            <Theme name={scheme}>
              <WebColorScheme scheme={scheme} />
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <AuthProvider>
                <RootStack />
              </AuthProvider>
            </Theme>
          </TamaguiProvider>
        )}
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}

/** Keep the browser chrome (scrollbars, form controls, page background) in sync with the app theme. */
function WebColorScheme({ scheme }: { scheme: 'light' | 'dark' }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = scheme === 'dark' ? '#0A0A0A' : '#FFFFFF';
  }, [scheme]);
  return null;
}

/**
 * Hold the splash screen until the stored session has been checked, so the
 * navigator mounts once with the right URL (deep links like /join/CODE keep
 * their path instead of racing a redirect).
 */
function RootStack() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);
  if (status === 'loading') return null;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
