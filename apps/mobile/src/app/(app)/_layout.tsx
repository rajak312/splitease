import { Redirect, Stack, usePathname } from 'expo-router';
import { XStack, YStack } from 'tamagui';

import { Sidebar } from '../../components/Sidebar';
import { useAuth } from '../../lib/auth';
import { useIsWide } from '../../lib/layout';
import { pendingRedirect } from '../../lib/redirect';

/**
 * Authenticated shell. Wide screens (desktop web, tablets) get a persistent
 * sidebar next to the navigation stack; phones get bottom tabs (see
 * (tabs)/_layout). The Stack keeps the same position in the tree so resizing
 * the window never remounts navigation state.
 */
export default function AppLayout() {
  const { status } = useAuth();
  const pathname = usePathname();
  const wide = useIsWide();

  if (status !== 'signedIn') {
    if (pathname.startsWith('/join/')) pendingRedirect.set(pathname);
    return <Redirect href="/welcome" />;
  }

  return (
    <XStack flex={1} bg="$background">
      {wide ? <Sidebar /> : null}
      <YStack flex={1}>
        <Stack screenOptions={{ headerShown: false, animation: wide ? 'none' : 'default' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="groups/new" options={{ presentation: wide ? 'card' : 'modal' }} />
          <Stack.Screen name="groups/[id]/add-expense" options={{ presentation: wide ? 'card' : 'modal' }} />
          <Stack.Screen name="groups/[id]/settle" options={{ presentation: wide ? 'card' : 'modal' }} />
        </Stack>
      </YStack>
    </XStack>
  );
}
