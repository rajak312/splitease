import { createSystemFont, defaultConfig } from '@tamagui/config/v5';
import { Platform } from 'react-native';
import { createTamagui } from 'tamagui';

/**
 * Tamagui v2, runtime-only (no compiler): styles resolve at runtime on native
 * and are injected as atomic CSS on web. Starts from the v5 defaults (light /
 * dark themes with Radix-style 12-step palettes, media queries) and swaps the
 * fonts for Inter.
 */
const face = {
  400: { normal: 'Inter_400Regular' },
  500: { normal: 'Inter_500Medium' },
  600: { normal: 'Inter_600SemiBold' },
  700: { normal: 'Inter_700Bold' },
  800: { normal: 'Inter_800ExtraBold' },
  900: { normal: 'Inter_800ExtraBold' },
};

const family =
  Platform.OS === 'web' ? "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" : 'Inter_400Regular';

const inter = createSystemFont({ font: { family, face } });

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  fonts: { body: inter, heading: inter },
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
    allowedStyleValues: false,
  },
});

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Tamagui module augmentation
  interface TamaguiCustomConfig extends Conf {}
}
