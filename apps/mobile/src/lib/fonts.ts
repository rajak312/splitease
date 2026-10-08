import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Asset } from 'expo-asset';
import { useFonts } from 'expo-font';
import { Platform } from 'react-native';

const FACES = {
  400: Inter_400Regular,
  500: Inter_500Medium,
  600: Inter_600SemiBold,
  700: Inter_700Bold,
  800: Inter_800ExtraBold,
} as const;

function injectWebFonts() {
  if (typeof document === 'undefined' || document.getElementById('splitease-inter')) return;
  const css = Object.entries(FACES)
    .map(
      ([weight, mod]) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;src:url('${Asset.fromModule(mod).uri}') format('truetype');}`,
    )
    .join('\n');
  const style = document.createElement('style');
  style.id = 'splitease-inter';
  style.textContent = css;
  document.head.appendChild(style);
}

if (Platform.OS === 'web') injectWebFonts();

/**
 * Native: register each weight as its own family (Inter_700Bold…); the Tamagui
 * font `face` map picks the right one per fontWeight.
 * Web: a single "Inter" family with real weights is declared via @font-face at
 * import time, so the browser handles weight matching (font-display: swap).
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(
    Platform.OS === 'web'
      ? {}
      : {
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
          Inter_800ExtraBold,
        },
  );
  return Platform.OS === 'web' ? true : loaded;
}
