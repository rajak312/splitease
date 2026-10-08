import { CATEGORY_META, EXPENSE_CATEGORIES, type ExpenseCategory } from '@splitease/shared';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Share } from 'react-native';
import { ScrollView, XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useQuery } from 'urql';

import { DonutChart } from '../components/DonutChart';
import { ExpenseRow } from '../components/ExpenseRow';
import { ArrowRight, Copy, Handshake, Plus, Share2 } from '../components/icons';
import {
  Amount,
  Avatar,
  AvatarStack,
  Btn,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Header,
  IconButton,
  ListSkeleton,
  Screen,
  SectionTitle,
  Segmented,
  Skeleton,
} from '../components/ui';
import { GroupExpensesQuery, GroupQuery } from '../graphql/documents';
import type { GroupQuery as GroupData } from '../graphql/generated/graphql';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { balanceLabel, firstName, formatMoney, monthLabel } from '../lib/format';
import { haptics } from '../lib/haptics';
import { useIsWide } from '../lib/layout';

type Group = NonNullable<GroupData['group']>;
type Tab = 'expenses' | 'balances' | 'insights';

/* -------------------------------------------------------------- sections */

function InviteCard({ group, onClose }: { group: Group; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(group.inviteUrl);
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const share = async () => {
    const message = `Join "${group.name}" on SplitEase: ${group.inviteUrl} (code ${group.inviteCode})`;
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator & {
        share?: (d: { title: string; text: string; url: string }) => Promise<void>;
      };
      if (nav.share)
        await nav.share({ title: 'SplitEase invite', text: message, url: group.inviteUrl }).catch(() => undefined);
      else await copy();
      return;
    }
    await Share.share({ message, url: group.inviteUrl });
  };
  return (
    <Card bg="$green2" borderColor="$green6" testID="invite-card">
      <XStack items="center" justify="space-between">
        <Text fontSize={16} fontWeight="700" color="$color12">
          Invite friends
        </Text>
        <Text fontSize={14} color="$green11" fontWeight="600" onPress={onClose} role="button">
          Done
        </Text>
      </XStack>
      <Text fontSize={14} color="$color11">
        Share this link or code. Anyone with it can join and add expenses.
      </Text>
      <XStack
        bg="$color1"
        rounded={14}
        px="$4"
        py="$3"
        items="center"
        justify="space-between"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <Text fontSize={26} fontWeight="800" letterSpacing={4} color="$color12">
          {group.inviteCode}
        </Text>
        <Text fontSize={12} color="$color10" numberOfLines={1} flexShrink={1} ml="$3">
          {group.inviteUrl.replace(/^https?:\/\//, '')}
        </Text>
      </XStack>
      <XStack gap="$3">
        <Btn variant="secondary" flex={1} icon={<Copy size={16} color="$color12" />} onPress={copy}>
          {copied ? 'Copied!' : 'Copy link'}
        </Btn>
        <Btn flex={1} icon={<Share2 size={16} color="white" />} onPress={share}>
          Share
        </Btn>
      </XStack>
    </Card>
  );
}

function SimplifiedDebts({ group, viewerId }: { group: Group; viewerId: string | null }) {
  const router = useRouter();
  if (group.simplifiedDebts.length === 0) {
    return (
      <Card items="center" py="$5">
        <Text fontSize={32}>🎉</Text>
        <Text fontSize={16} fontWeight="700" color="$color12">
          Everyone is settled up
        </Text>
      </Card>
    );
  }
  return (
    <Card gap="$1" testID="simplified-debts">
      <XStack items="center" justify="space-between" mb="$2">
        <YStack>
          <Text fontSize={16} fontWeight="700" color="$color12">
            Suggested payments
          </Text>
          <Text fontSize={13} color="$color10">
            {group.simplifiedDebts.length} transfer{group.simplifiedDebts.length === 1 ? '' : 's'} settle the whole
            group
          </Text>
        </YStack>
        <Handshake size={22} color="$green10" />
      </XStack>
      {group.simplifiedDebts.map((d) => {
        const involvesMe = d.from.id === viewerId || d.to.id === viewerId;
        const fromName = d.from.id === viewerId ? 'You' : firstName(d.from.name);
        const toName = d.to.id === viewerId ? 'you' : firstName(d.to.name);
        return (
          <XStack
            key={`${d.from.id}-${d.to.id}`}
            items="center"
            gap="$2.5"
            py="$2.5"
            borderTopWidth={1}
            borderColor="$borderColor"
            accessibilityLabel={`${fromName} pays ${toName} ${formatMoney(d.amount, group.currency)}`}
          >
            <Avatar name={d.from.name} color={d.from.avatarColor} size={32} />
            <ArrowRight size={14} color="$color9" />
            <Avatar name={d.to.name} color={d.to.avatarColor} size={32} />
            <YStack flex={1} minW={0}>
              <Text fontSize={14} color="$color12" numberOfLines={2}>
                <Text fontWeight="700" color="$color12">
                  {fromName}
                </Text>{' '}
                {d.from.id === viewerId ? 'pay' : 'pays'}{' '}
                <Text fontWeight="700" color="$color12">
                  {toName}
                </Text>
              </Text>
              <Text
                fontSize={15}
                fontWeight="800"
                color={d.from.id === viewerId ? '$red10' : d.to.id === viewerId ? '$green10' : '$color12'}
                fontVariant={['tabular-nums']}
              >
                {formatMoney(d.amount, group.currency)}
              </Text>
            </YStack>
            <Btn
              size="sm"
              variant={involvesMe ? 'primary' : 'secondary'}
              onPress={() =>
                router.push({
                  pathname: '/groups/[id]/settle',
                  params: { id: group.id, from: d.from.id, to: d.to.id, amount: String(d.amount) },
                })
              }
              accessibilityLabel={`Record payment from ${fromName} to ${toName}`}
            >
              Settle
            </Btn>
          </XStack>
        );
      })}
    </Card>
  );
}

function MemberBalances({ group, viewerId }: { group: Group; viewerId: string | null }) {
  const max = Math.max(1, ...group.balances.map((b) => Math.abs(b.net)));
  const sorted = [...group.balances].sort((a, b) => b.net - a.net);
  return (
    <Card gap="$3">
      <Text fontSize={16} fontWeight="700" color="$color12">
        Balances
      </Text>
      {sorted.map((b) => {
        const pct = Math.max(2, Math.round((Math.abs(b.net) / max) * 100));
        return (
          <YStack key={b.user.id} gap="$1.5">
            <XStack items="center" gap="$2.5">
              <Avatar name={b.user.name} color={b.user.avatarColor} size={28} />
              <Text
                flex={1}
                fontSize={14}
                color="$color12"
                fontWeight={b.user.id === viewerId ? '700' : '500'}
                numberOfLines={1}
              >
                {b.user.id === viewerId ? 'You' : b.user.name}
              </Text>
              <Text fontSize={13} color="$color10">
                {b.net > 0 ? 'gets back' : b.net < 0 ? 'owes' : 'settled'}
              </Text>
              {b.net !== 0 ? <Amount value={b.net} currency={group.currency} fontSize={14} /> : null}
            </XStack>
            <XStack
              height={6}
              rounded={6}
              bg="$color3"
              overflow="hidden"
              justify={b.net < 0 ? 'flex-end' : 'flex-start'}
            >
              <YStack width={`${b.net === 0 ? 0 : pct}%`} bg={b.net >= 0 ? '$green9' : '$red9'} rounded={6} />
            </XStack>
          </YStack>
        );
      })}
    </Card>
  );
}

function Insights({ group }: { group: Group }) {
  const total = group.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
  if (total === 0) {
    return <EmptyState emoji="📊" title="No spending yet" message="Add an expense to see where the money goes." />;
  }
  return (
    <Card gap="$4" testID="insights">
      <Text fontSize={16} fontWeight="700" color="$color12">
        Spending by category
      </Text>
      <XStack gap="$5" items="center" flexWrap="wrap" justify="center">
        <DonutChart
          data={group.categoryBreakdown.map((c) => ({
            key: c.category,
            value: c.amount,
            color: CATEGORY_META[c.category as ExpenseCategory].color,
          }))}
          centerLabel="Total"
          centerValue={formatMoney(total, group.currency, { compact: true })}
        />
        <YStack flex={1} minW={200} gap="$2">
          {group.categoryBreakdown.map((c) => {
            const meta = CATEGORY_META[c.category as ExpenseCategory];
            const pct = Math.round((c.amount / total) * 1000) / 10;
            return (
              <XStack key={c.category} items="center" gap="$2.5">
                <YStack width={10} height={10} rounded={3} bg={meta.color} />
                <Text flex={1} fontSize={14} color="$color12" numberOfLines={1}>
                  {meta.emoji} {meta.label}
                </Text>
                <Text fontSize={13} color="$color10" width={46} text="right">
                  {pct}%
                </Text>
                <Text
                  fontSize={14}
                  fontWeight="700"
                  color="$color12"
                  width={96}
                  text="right"
                  fontVariant={['tabular-nums']}
                >
                  {formatMoney(c.amount, group.currency, { compact: true })}
                </Text>
              </XStack>
            );
          })}
        </YStack>
      </XStack>
    </Card>
  );
}

function ExpenseList({ group, viewerId }: { group: Group; viewerId: string | null }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const trimmed = search.trim();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: GroupExpensesQuery,
    variables: { id: group.id, first: 20, after, search: trimmed || null, category },
  });
  // Poll / focus refresh only — the parent screen owns the subscription.
  useLiveRefresh(() => refetch({ requestPolicy: 'network-only' }), { subscribe: false });

  const conn = data?.group?.expenses;
  const sections = useMemo(() => {
    const out: { title: string; items: NonNullable<typeof conn>['edges'][number]['node'][] }[] = [];
    for (const edge of conn?.edges ?? []) {
      const title = monthLabel(edge.node.date);
      const last = out[out.length - 1];
      if (last?.title === title) last.items.push(edge.node);
      else out.push({ title, items: [edge.node] });
    }
    return out;
  }, [conn]);

  return (
    <YStack gap="$3">
      <XStack items="center" gap="$2">
        <YStack flex={1}>
          <Field
            label="Search expenses"
            value={search}
            onChangeText={(t: string) => {
              setSearch(t);
              setAfter(null);
            }}
            placeholder="Search by description or note"
            testID="expense-search"
          />
        </YStack>
      </XStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$2">
          <Chip selected={category === null} onPress={() => (setCategory(null), setAfter(null))}>
            All
          </Chip>
          {EXPENSE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              selected={category === c}
              onPress={() => (setCategory(category === c ? null : c), setAfter(null))}
              testID={`filter-${c}`}
            >
              {`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
            </Chip>
          ))}
        </XStack>
      </ScrollView>

      {!conn && fetching ? (
        <ListSkeleton rows={5} />
      ) : !conn && error ? (
        <ErrorState message={errorInfo(error)?.message} onRetry={() => refetch({ requestPolicy: 'network-only' })} />
      ) : conn && conn.edges.length === 0 ? (
        trimmed || category ? (
          <EmptyState emoji="🔍" title="No matching expenses" message="Try a different search or category." />
        ) : (
          <EmptyState
            emoji="🧾"
            title="No expenses yet"
            message="Add the first expense and SplitEase will keep the balances."
            action={<Btn onPress={() => router.push(`/groups/${group.id}/add-expense`)}>Add an expense</Btn>}
          />
        )
      ) : (
        <YStack gap="$3">
          {sections.map((s) => (
            <YStack key={s.title} gap="$1">
              <SectionTitle>{s.title}</SectionTitle>
              <Card py="$1" px="$4" gap={0}>
                {s.items.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    viewerId={viewerId}
                    onPress={() => router.push(`/expenses/${e.id}`)}
                  />
                ))}
              </Card>
            </YStack>
          ))}
          {conn?.pageInfo.hasNextPage ? (
            <Btn variant="secondary" loading={fetching} onPress={() => setAfter(conn.pageInfo.endCursor ?? null)}>
              Load more
            </Btn>
          ) : conn && conn.totalCount > 0 ? (
            <Text text="center" color="$color9" fontSize={13}>
              {conn.totalCount} expense{conn.totalCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </YStack>
      )}
    </YStack>
  );
}

/* ------------------------------------------------------------------ screen */

export function GroupScreen({ id }: { id: string }) {
  const router = useRouter();
  const wide = useIsWide();
  const { userId } = useAuth();
  const [tab, setTab] = useState<Tab>('expenses');
  const [showInvite, setShowInvite] = useState(false);
  const [{ data, fetching, error }, refetch] = useQuery({ query: GroupQuery, variables: { id } });
  const live = useLiveRefresh(() => refetch({ requestPolicy: 'network-only' }), { groupId: id });
  const group = data?.group;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!group) {
    return (
      <Screen>
        <Header title="Group" onBack={back} />
        {fetching || !error ? (
          <YStack gap="$4">
            <Skeleton height={140} radius={20} />
            <ListSkeleton rows={5} />
          </YStack>
        ) : (
          <ErrorState message={errorInfo(error)?.message} onRetry={() => refetch({ requestPolicy: 'network-only' })} />
        )}
      </Screen>
    );
  }

  const { label, tone } = balanceLabel(group.myBalance, group.currency);

  const summary = (
    <Card p="$4" gap="$4">
      <XStack items="center" gap="$4" flexWrap="wrap">
        <YStack flex={1} minW={180} gap={2}>
          <Text fontSize={13} color="$color10" fontWeight="600">
            Your balance
          </Text>
          <Text
            fontSize={28}
            fontWeight="800"
            letterSpacing={-0.5}
            color={tone === 'positive' ? '$green10' : tone === 'negative' ? '$red10' : '$color12'}
            testID="my-balance"
          >
            {tone === 'neutral' ? 'Settled up ✓' : label.charAt(0).toUpperCase() + label.slice(1)}
          </Text>
        </YStack>
        <YStack gap={2} items="flex-end">
          <Text fontSize={13} color="$color10" fontWeight="600">
            Group spend
          </Text>
          <Text fontSize={18} fontWeight="800" color="$color12" fontVariant={['tabular-nums']}>
            {formatMoney(group.totalSpent, group.currency, { compact: true })}
          </Text>
          <Text fontSize={12} color="$color10">
            {group.expenseCount} expenses
          </Text>
        </YStack>
      </XStack>
      <XStack gap="$3">
        <Btn
          flex={1}
          icon={<Plus size={16} color="white" />}
          onPress={() => router.push(`/groups/${group.id}/add-expense`)}
          testID="add-expense"
        >
          Add expense
        </Btn>
        <Btn
          flex={1}
          variant="secondary"
          icon={<Handshake size={16} color="$color12" />}
          onPress={() => router.push({ pathname: '/groups/[id]/settle', params: { id: group.id } })}
        >
          Settle up
        </Btn>
      </XStack>
    </Card>
  );

  const headerRight = (
    <XStack gap="$2" items="center">
      {wide ? <AvatarStack users={group.members.map((m) => m.user)} max={5} size={28} /> : null}
      <IconButton
        label="Invite friends"
        icon={<Share2 size={18} color="$color12" />}
        onPress={() => setShowInvite((v) => !v)}
        testID="invite"
      />
    </XStack>
  );

  return (
    <Screen refreshing={live.refreshing} onRefresh={live.onRefresh} testID="group-screen">
      <Header
        title={group.name}
        subtitle={`${group.memberCount} members · ${group.currency}`}
        onBack={back}
        leading={<Avatar name={group.name} emoji={group.emoji} size={44} />}
        right={headerRight}
      />
      {showInvite ? <InviteCard group={group} onClose={() => setShowInvite(false)} /> : null}

      {wide ? (
        <XStack gap="$4" items="flex-start">
          <YStack flex={1.35} gap="$4" minW={0}>
            {summary}
            <ExpenseList group={group} viewerId={userId} />
          </YStack>
          <YStack flex={1} gap="$4" minW={0}>
            <SimplifiedDebts group={group} viewerId={userId} />
            <MemberBalances group={group} viewerId={userId} />
            <Insights group={group} />
          </YStack>
        </XStack>
      ) : (
        <>
          {summary}
          <Segmented<Tab>
            label="Group sections"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'balances', label: 'Balances' },
              { value: 'insights', label: 'Insights' },
            ]}
          />
          {tab === 'expenses' ? <ExpenseList group={group} viewerId={userId} /> : null}
          {tab === 'balances' ? (
            <YStack gap="$4">
              <SimplifiedDebts group={group} viewerId={userId} />
              <MemberBalances group={group} viewerId={userId} />
            </YStack>
          ) : null}
          {tab === 'insights' ? <Insights group={group} /> : null}
        </>
      )}
    </Screen>
  );
}
