import { useWindowDimensions } from 'react-native';

/** At or above this width the app shows a sidebar instead of bottom tabs. */
export const SIDEBAR_BREAKPOINT = 900;

export function useIsWide() {
  return useWindowDimensions().width >= SIDEBAR_BREAKPOINT;
}
