import * as WebBrowser from 'expo-web-browser';
import { XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useQuery } from 'urql';

import { Github, LogOut } from '../components/icons';
import { Avatar, Btn, Card, Header, Screen, SectionTitle, Segmented } from '../components/ui';
import { MeQuery } from '../graphql/documents';
import { useAuth } from '../lib/auth';
import { API_URL, GITHUB_URL, REALTIME_MODE } from '../lib/config';
import { useThemePreference, type ThemePreference } from '../lib/theme-preference';

export function AccountScreen() {
  const { signOut } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const [{ data }] = useQuery({ query: MeQuery });
  const me = data?.me;

  return (
    <Screen testID="account-screen">
      <Header title="Account" />
      {me ? (
        <Card flexDirection="row" items="center" gap="$4">
          <Avatar name={me.name} color={me.avatarColor} size={60} />
          <YStack flex={1} minW={0}>
            <Text fontSize={20} fontWeight="800" color="$color12" numberOfLines={1}>
              {me.name}
            </Text>
            <Text fontSize={14} color="$color10" numberOfLines={1}>
              {me.isDemo ? 'Demo sandbox — deleted after 24 hours' : me.email}
            </Text>
          </YStack>
        </Card>
      ) : null}

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Segmented<ThemePreference>
          label="Theme"
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card gap="$2">
        <Text fontSize={15} color="$color12">
          SplitEase is an open-source portfolio project by Lalit Rajak: one React Native codebase for iOS, Android and
          the web, talking to a GraphQL API.
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          <Text fontSize={12} color="$color10">
            API: {API_URL.replace(/^https?:\/\//, '')}
          </Text>
          <Text fontSize={12} color="$color10">
            · Realtime: {REALTIME_MODE === 'sse' ? 'GraphQL subscriptions (SSE)' : 'polling'}
          </Text>
        </XStack>
        <Btn
          variant="secondary"
          icon={<Github size={16} color="$color12" />}
          onPress={() => void WebBrowser.openBrowserAsync(GITHUB_URL)}
        >
          View source on GitHub
        </Btn>
      </Card>

      <Btn variant="danger" icon={<LogOut size={16} color="$red11" />} onPress={() => void signOut()} testID="sign-out">
        Sign out
      </Btn>
    </Screen>
  );
}
