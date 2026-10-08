import { useRouter } from 'expo-router';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useQuery } from 'urql';

import { Avatar, Btn, Card, EmptyState, ErrorState, Header, ListSkeleton, Row, Screen } from '../components/ui';
import { ActivityQuery } from '../graphql/documents';
import type { ActivityFieldsFragment } from '../graphql/generated/graphql';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { formatMoney, relativeTime } from '../lib/format';

export function describeActivity(a: ActivityFieldsFragment, viewerId: string | null) {
  const actor = a.actor.id === viewerId ? 'You' : a.actor.name;
  switch (a.type) {
    case 'GROUP_CREATED':
      return { icon: '✨', text: `${actor} created ${a.group.name}` };
    case 'MEMBER_JOINED':
      return { icon: '👋', text: `${actor} joined ${a.group.name}` };
    case 'EXPENSE_ADDED':
      return { icon: '🧾', text: `${actor} added “${a.summary}”` };
    case 'EXPENSE_UPDATED':
      return { icon: '✏️', text: `${actor} updated “${a.summary}”` };
    case 'EXPENSE_DELETED':
      return { icon: '🗑️', text: `${actor} deleted “${a.summary}”` };
    case 'SETTLEMENT_ADDED':
      return { icon: '🤝', text: `${a.summary}` };
    default:
      return { icon: '•', text: a.summary };
  }
}

export function ActivityScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const [after, setAfter] = useState<string | null>(null);
  const [{ data, fetching, error }, refetch] = useQuery({ query: ActivityQuery, variables: { first: 25, after } });
  const live = useLiveRefresh(() => refetch({ requestPolicy: 'network-only' }));
  const edges = data?.activity.edges ?? [];

  return (
    <Screen refreshing={live.refreshing} onRefresh={live.onRefresh} testID="activity-screen">
      <Header title="Activity" subtitle="Everything happening across your groups" />
      {!data && fetching ? (
        <ListSkeleton rows={6} />
      ) : !data && error ? (
        <ErrorState message={errorInfo(error)?.message} onRetry={() => refetch({ requestPolicy: 'network-only' })} />
      ) : edges.length === 0 ? (
        <EmptyState emoji="🌱" title="Nothing yet" message="Expenses, payments and new members will show up here." />
      ) : (
        <Card py="$2" gap={0}>
          {edges.map(({ node: a }) => {
            const d = describeActivity(a, userId);
            return (
              <Row
                key={a.id}
                onPress={() => router.push(a.expenseId ? `/expenses/${a.expenseId}` : `/groups/${a.group.id}`)}
                accessibilityLabel={d.text}
              >
                <YStack>
                  <Avatar name={a.actor.name} color={a.actor.avatarColor} size={40} />
                  <YStack
                    position="absolute"
                    r={-4}
                    b={-4}
                    width={20}
                    height={20}
                    rounded={10}
                    bg="$color1"
                    items="center"
                    justify="center"
                  >
                    <Text fontSize={11}>{d.icon}</Text>
                  </YStack>
                </YStack>
                <YStack flex={1} minW={0} gap={2}>
                  <Text fontSize={15} color="$color12" numberOfLines={2}>
                    {d.text}
                  </Text>
                  <Text fontSize={13} color="$color10">
                    {a.group.emoji} {a.group.name} · {relativeTime(a.createdAt)}
                  </Text>
                </YStack>
                {a.amount !== null && a.currency ? (
                  <XStack>
                    <Text
                      fontSize={15}
                      fontWeight="700"
                      color={a.type === 'EXPENSE_DELETED' ? '$color9' : '$color12'}
                      textDecorationLine={a.type === 'EXPENSE_DELETED' ? 'line-through' : 'none'}
                      fontVariant={['tabular-nums']}
                    >
                      {formatMoney(a.amount, a.currency)}
                    </Text>
                  </XStack>
                ) : null}
              </Row>
            );
          })}
        </Card>
      )}
      {data?.activity.pageInfo.hasNextPage ? (
        <Btn variant="secondary" loading={fetching} onPress={() => setAfter(data.activity.pageInfo.endCursor ?? null)}>
          Load more
        </Btn>
      ) : null}
    </Screen>
  );
}
