import { useRouter } from 'expo-router';
import { ScrollView, XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useQuery } from 'urql';

import { GroupCard } from '../components/GroupCard';
import { Plus, UserPlus } from '../components/icons';
import {
  Avatar,
  Btn,
  Card,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  ListSkeleton,
  Screen,
  SectionTitle,
  Skeleton,
} from '../components/ui';
import { DashboardQuery, MeQuery } from '../graphql/documents';
import type { DashboardQuery as DashboardData } from '../graphql/generated/graphql';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { errorInfo } from '../lib/errors';
import { firstName, formatMoney } from '../lib/format';
import { useIsWide } from '../lib/layout';

type Totals = DashboardData['dashboard']['totals'];

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function BalanceSummary({ totals }: { totals: Totals }) {
  const primary = totals[0];
  const rest = totals.slice(1);
  if (!primary) {
    return (
      <Card bg="$green9" borderColor="$green9" p="$5">
        <Text color="white" fontSize={15} opacity={0.9}>
          Overall balance
        </Text>
        <Text color="white" fontSize={30} fontWeight="800">
          All settled up 🎉
        </Text>
      </Card>
    );
  }
  const net = primary.owed - primary.owes;
  return (
    <Card bg="$green9" borderColor="$green9" p="$5" gap="$4" testID="balance-summary">
      <YStack gap="$1">
        <Text color="white" fontSize={14} opacity={0.85} fontWeight="600">
          {net >= 0 ? 'Overall, you are owed' : 'Overall, you owe'}
        </Text>
        <Text color="white" fontSize={36} fontWeight="800" letterSpacing={-1} fontVariant={['tabular-nums']}>
          {formatMoney(Math.abs(net), primary.currency)}
        </Text>
      </YStack>
      <XStack gap="$3">
        <YStack flex={1} bg="rgba(255,255,255,0.16)" rounded={14} p="$3" gap={2}>
          <Text color="white" opacity={0.85} fontSize={13}>
            You are owed
          </Text>
          <Text color="white" fontSize={18} fontWeight="800" fontVariant={['tabular-nums']}>
            {formatMoney(primary.owed, primary.currency)}
          </Text>
        </YStack>
        <YStack flex={1} bg="rgba(0,0,0,0.12)" rounded={14} p="$3" gap={2}>
          <Text color="white" opacity={0.85} fontSize={13}>
            You owe
          </Text>
          <Text color="white" fontSize={18} fontWeight="800" fontVariant={['tabular-nums']}>
            {formatMoney(primary.owes, primary.currency)}
          </Text>
        </YStack>
      </XStack>
      {rest.length > 0 ? (
        <XStack gap="$2" flexWrap="wrap">
          {rest.map((t) => (
            <XStack key={t.currency} bg="rgba(255,255,255,0.16)" rounded={999} px="$3" py="$1.5">
              <Text color="white" fontSize={13} fontWeight="600">
                {t.currency}: {t.net >= 0 ? 'owed ' : 'owe '}
                {formatMoney(Math.abs(t.net), t.currency)}
              </Text>
            </XStack>
          ))}
        </XStack>
      ) : null}
    </Card>
  );
}

function FriendBalances({ friends, vertical }: { friends: DashboardData['dashboard']['friends']; vertical?: boolean }) {
  if (friends.length === 0) return null;
  if (vertical) {
    return (
      <Card gap="$1" py="$3" flex={1} testID="friend-balances">
        <Text fontSize={16} fontWeight="700" color="$color12" mb="$1">
          Friends
        </Text>
        {friends.slice(0, 5).map((f) => (
          <XStack key={`${f.user.id}-${f.currency}`} items="center" gap="$3" py="$1.5">
            <Avatar name={f.user.name} color={f.user.avatarColor} size={32} />
            <Text flex={1} fontSize={14} color="$color12" numberOfLines={1}>
              {f.amount > 0 ? `${firstName(f.user.name)} owes you` : `You owe ${firstName(f.user.name)}`}
            </Text>
            <Text
              fontSize={14}
              fontWeight="800"
              color={f.amount > 0 ? '$green10' : '$red10'}
              fontVariant={['tabular-nums']}
            >
              {formatMoney(Math.abs(f.amount), f.currency)}
            </Text>
          </XStack>
        ))}
      </Card>
    );
  }
  return (
    <YStack gap="$2">
      <SectionTitle>Friends</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$3" pb="$1">
          {friends.map((f) => (
            <Card key={`${f.user.id}-${f.currency}`} p="$3" gap="$2" width={150} items="center">
              <Avatar name={f.user.name} color={f.user.avatarColor} size={40} />
              <Text fontSize={14} fontWeight="700" color="$color12" numberOfLines={1}>
                {firstName(f.user.name)}
              </Text>
              <Text fontSize={12} color={f.amount > 0 ? '$green10' : '$red10'} text="center">
                {f.amount > 0 ? 'owes you' : 'you owe'}
              </Text>
              <Text
                fontSize={15}
                fontWeight="800"
                color={f.amount > 0 ? '$green10' : '$red10'}
                fontVariant={['tabular-nums']}
              >
                {formatMoney(Math.abs(f.amount), f.currency)}
              </Text>
            </Card>
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const wide = useIsWide();
  const [{ data, fetching, error, stale }, refetch] = useQuery({ query: DashboardQuery });
  const [{ data: me }] = useQuery({ query: MeQuery });
  const live = useLiveRefresh(() => refetch({ requestPolicy: 'network-only' }));

  const actions = (
    <XStack gap="$2" items="center">
      <IconButton
        label="Join a group"
        icon={<UserPlus size={18} color="$color12" />}
        onPress={() => router.push('/join')}
      />
      {wide ? (
        <Btn size="sm" icon={<Plus size={16} color="white" />} onPress={() => router.push('/groups/new')}>
          New group
        </Btn>
      ) : (
        <IconButton
          label="New group"
          icon={<Plus size={20} color="$color12" />}
          onPress={() => router.push('/groups/new')}
          testID="new-group"
        />
      )}
    </XStack>
  );

  return (
    <Screen refreshing={live.refreshing || (stale && !!data)} onRefresh={live.onRefresh} testID="home-screen">
      <Header
        title={me?.me ? `${greeting()}, ${firstName(me.me.name)}` : 'Your groups'}
        subtitle={me?.me?.isDemo ? 'Demo sandbox · changes are private to you' : 'Here’s where everyone stands'}
        right={actions}
      />

      {!data && fetching ? (
        <YStack gap="$4">
          <Skeleton height={170} radius={20} />
          <ListSkeleton rows={4} />
        </YStack>
      ) : !data && error ? (
        <ErrorState message={errorInfo(error)?.message} onRetry={() => refetch({ requestPolicy: 'network-only' })} />
      ) : data ? (
        <>
          <XStack gap="$4" flexDirection={wide ? 'row' : 'column'} items="stretch">
            <YStack flex={wide ? 1.2 : undefined}>
              <BalanceSummary totals={data.dashboard.totals} />
            </YStack>
            {wide ? (
              <YStack flex={1}>
                <FriendBalances friends={data.dashboard.friends} vertical />
              </YStack>
            ) : null}
          </XStack>
          {!wide ? <FriendBalances friends={data.dashboard.friends} /> : null}

          <SectionTitle>Groups · {data.groups.length}</SectionTitle>
          {data.groups.length === 0 ? (
            <EmptyState
              emoji="👋"
              title="No groups yet"
              message="Create a group for your next trip or flat, or join one with an invite code."
              action={
                <XStack gap="$3">
                  <Btn onPress={() => router.push('/groups/new')}>Create a group</Btn>
                  <Btn variant="secondary" onPress={() => router.push('/join')}>
                    Join with code
                  </Btn>
                </XStack>
              }
            />
          ) : (
            <YStack gap="$3">
              {data.groups.map((g) => (
                <GroupCard key={g.id} group={g} onPress={() => router.push(`/groups/${g.id}`)} />
              ))}
            </YStack>
          )}
        </>
      ) : null}
    </Screen>
  );
}
