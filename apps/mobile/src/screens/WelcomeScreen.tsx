import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation } from 'urql';

import { Wordmark } from '../components/Brand';
import { Avatar, Btn, Card } from '../components/ui';
import { LoginDemoMutation } from '../graphql/documents';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { haptics } from '../lib/haptics';

const FEATURES = [
  {
    emoji: '⚖️',
    title: 'Fair to the paisa',
    text: 'Equal, exact, percentage or share splits — integer maths, no rounding drift.',
  },
  { emoji: '🔀', title: 'Fewer transfers', text: 'Debt simplification turns a web of IOUs into the minimum payments.' },
  {
    emoji: '⚡',
    title: 'Live & offline-friendly',
    text: 'Optimistic updates, realtime sync and a cache that works on the train.',
  },
];

function PreviewCard() {
  const debts = [
    { from: 'Rahul', fromColor: '#3B82F6', to: 'Aarav', toColor: '#6366F1', amount: '₹6,240' },
    { from: 'Ananya', fromColor: '#EC4899', to: 'Priya', toColor: '#F59E0B', amount: '₹3,105' },
    { from: 'Vikram', fromColor: '#10B981', to: 'Aarav', toColor: '#6366F1', amount: '₹1,870' },
  ];
  return (
    <Card
      p="$5"
      gap="$4"
      shadowColor="$shadowColor"
      shadowRadius={30}
      shadowOffset={{ width: 0, height: 12 }}
      maxW={420}
      width="100%"
    >
      <XStack items="center" gap="$3">
        <Avatar name="Goa Trip" emoji="🏖️" size={48} />
        <YStack flex={1}>
          <Text fontSize={17} fontWeight="700" color="$color12">
            Goa Trip
          </Text>
          <Text fontSize={13} color="$color10">
            5 friends · 10 expenses
          </Text>
        </YStack>
        <YStack items="flex-end">
          <Text fontSize={12} color="$color10">
            you are owed
          </Text>
          <Text fontSize={18} fontWeight="800" color="$green10">
            ₹18,936.99
          </Text>
        </YStack>
      </XStack>
      <YStack height={1} bg="$borderColor" />
      <Text fontSize={12} fontWeight="700" color="$color10" letterSpacing={0.8}>
        SIMPLIFIED PLAN · 3 PAYMENTS
      </Text>
      {debts.map((d) => (
        <XStack key={d.from} items="center" gap="$2.5">
          <Avatar name={d.from} color={d.fromColor} size={30} />
          <Text fontSize={14} color="$color11" flex={1}>
            <Text fontWeight="700" color="$color12">
              {d.from}
            </Text>{' '}
            pays{' '}
            <Text fontWeight="700" color="$color12">
              {d.to}
            </Text>
          </Text>
          <Text fontSize={15} fontWeight="800" color="$color12">
            {d.amount}
          </Text>
        </XStack>
      ))}
    </Card>
  );
}

export function WelcomeScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [{ fetching }, loginDemo] = useMutation(LoginDemoMutation);
  const [error, setError] = useState<string | null>(null);

  const tryDemo = async () => {
    setError(null);
    const result = await loginDemo({});
    if (result.data?.loginDemo) {
      haptics.success();
      await signIn(result.data.loginDemo);
    } else {
      haptics.error();
      setError(errorInfo(result.error)?.message ?? 'Could not start the demo');
    }
  };

  return (
    <ScrollView flex={1} bg="$background" contentContainerStyle={{ flexGrow: 1 }}>
      <YStack
        flex={1}
        width="100%"
        maxWidth={1120}
        self="center"
        px="$5"
        pt={insets.top + 24}
        pb={insets.bottom + 32}
        gap="$6"
      >
        <Wordmark size={wide ? 40 : 34} />
        <XStack flex={1} gap="$8" items="center" flexDirection={wide ? 'row' : 'column'}>
          <YStack flex={wide ? 1 : undefined} gap="$5" width="100%">
            <YStack gap="$3">
              <Text
                fontSize={wide ? 54 : 36}
                lineHeight={wide ? 60 : 42}
                fontWeight="800"
                color="$color12"
                letterSpacing={wide ? -1.5 : -1}
                role="heading"
              >
                Split expenses,{'\n'}
                <Text color="$green10" fontSize={wide ? 54 : 36} fontWeight="800">
                  not friendships.
                </Text>
              </Text>
              <Text fontSize={wide ? 19 : 17} lineHeight={wide ? 28 : 25} color="$color11" maxW={520}>
                Track shared costs for trips, flats and office lunches. SplitEase does the maths and tells everyone
                exactly who pays whom.
              </Text>
            </YStack>

            <YStack gap="$3" maxW={420}>
              <Btn size="lg" onPress={tryDemo} loading={fetching} testID="try-demo">
                ✨ Try the demo — no sign-up
              </Btn>
              <XStack gap="$3">
                <Btn variant="secondary" flex={1} onPress={() => router.push('/login')} testID="go-login">
                  Log in
                </Btn>
                <Btn variant="secondary" flex={1} onPress={() => router.push('/signup')}>
                  Create account
                </Btn>
              </XStack>
              {error ? (
                <Text color="$red10" fontSize={14} role="alert">
                  {error}
                </Text>
              ) : (
                <Text color="$color10" fontSize={13}>
                  The demo creates a private sandbox with sample groups. It is deleted after 24 hours.
                </Text>
              )}
            </YStack>
          </YStack>

          <YStack flex={wide ? 1 : undefined} items="center" width="100%">
            <PreviewCard />
          </YStack>
        </XStack>

        <XStack gap="$4" flexWrap="wrap">
          {FEATURES.map((f) => (
            <YStack
              key={f.title}
              flex={1}
              minW={240}
              gap="$1.5"
              p="$4"
              rounded={18}
              bg="$color1"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Text fontSize={22}>{f.emoji}</Text>
              <Text fontSize={16} fontWeight="700" color="$color12">
                {f.title}
              </Text>
              <Text fontSize={14} lineHeight={20} color="$color10">
                {f.text}
              </Text>
            </YStack>
          ))}
        </XStack>
      </YStack>
    </ScrollView>
  );
}
