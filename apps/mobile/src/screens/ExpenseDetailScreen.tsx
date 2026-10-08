import { CATEGORY_META, formatBasisPoints, type ExpenseCategory } from '@splitease/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Alert } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation, useQuery } from 'urql';

import { Pencil, Trash2 } from '../components/icons';
import { Avatar, Btn, Card, ErrorState, Header, ListSkeleton, Screen, SectionTitle } from '../components/ui';
import { DeleteExpenseMutation, ExpenseQuery } from '../graphql/documents';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { formatDate, formatMoney, relativeTime } from '../lib/format';
import { haptics } from '../lib/haptics';

const MODE_LABEL = {
  EQUAL: 'split equally',
  EXACT: 'split by exact amounts',
  PERCENT: 'split by percentage',
  SHARES: 'split by shares',
};

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? true);
  return new Promise((resolve) =>
    Alert.alert('Delete expense?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function ExpenseDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { userId } = useAuth();
  const [{ data, fetching, error }, refetch] = useQuery({ query: ExpenseQuery, variables: { id } });
  const [del, runDelete] = useMutation(DeleteExpenseMutation);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const expense = data?.expense;
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(expense ? `/groups/${expense.group.id}` : '/');

  if (!expense) {
    return (
      <Screen>
        <Header title="Expense" onBack={back} />
        {fetching || !error ? (
          <ListSkeleton rows={3} />
        ) : (
          <ErrorState message={errorInfo(error)?.message} onRetry={() => refetch({ requestPolicy: 'network-only' })} />
        )}
      </Screen>
    );
  }

  const meta = CATEGORY_META[expense.category as ExpenseCategory] ?? CATEGORY_META.OTHER;
  const onDelete = async () => {
    if (!(await confirm(`"${expense.description}" will be removed for everyone in ${expense.group.name}.`))) return;
    const groupId = expense.group.id;
    const result = await runDelete({ id: expense.id });
    if (result.error) {
      haptics.error();
      setDeleteError(errorInfo(result.error)?.message ?? 'Could not delete');
      return;
    }
    haptics.success();
    if (router.canGoBack()) router.back();
    else router.replace(`/groups/${groupId}`);
  };

  const valueLabel = (value: number | null) => {
    if (value === null) return null;
    if (expense.splitMode === 'PERCENT') return `${formatBasisPoints(value)}%`;
    if (expense.splitMode === 'SHARES') return `${value} share${value === 1 ? '' : 's'}`;
    return null;
  };

  return (
    <Screen testID="expense-detail">
      <Header title={expense.description} subtitle={`${expense.group.emoji} ${expense.group.name}`} onBack={back} />
      <Card items="center" py="$6" gap="$2">
        <YStack width={64} height={64} rounded={20} items="center" justify="center" bg={`${meta.color}22`}>
          <Text fontSize={32}>{meta.emoji}</Text>
        </YStack>
        <Text fontSize={40} fontWeight="800" color="$color12" letterSpacing={-1} fontVariant={['tabular-nums']}>
          {formatMoney(expense.amount, expense.currency)}
        </Text>
        <Text fontSize={15} color="$color10">
          {meta.label} · {formatDate(expense.date)} · {MODE_LABEL[expense.splitMode as keyof typeof MODE_LABEL]}
        </Text>
        <XStack items="center" gap="$2" mt="$2">
          <Avatar name={expense.paidBy.name} color={expense.paidBy.avatarColor} size={24} />
          <Text fontSize={15} color="$color12">
            <Text fontWeight="700" color="$color12">
              {expense.paidBy.id === userId ? 'You' : expense.paidBy.name}
            </Text>{' '}
            paid
          </Text>
        </XStack>
      </Card>

      <SectionTitle>Who owes what</SectionTitle>
      <Card gap={0} py="$2">
        {expense.shares.map((s) => {
          const isPayer = s.user.id === expense.paidBy.id;
          return (
            <XStack key={s.id} items="center" gap="$3" py="$2.5">
              <Avatar name={s.user.name} color={s.user.avatarColor} size={34} />
              <YStack flex={1}>
                <Text fontSize={15} color="$color12" fontWeight={s.user.id === userId ? '700' : '500'}>
                  {s.user.id === userId ? 'You' : s.user.name}
                </Text>
                <Text fontSize={12} color="$color10">
                  {[valueLabel(s.value), isPayer ? 'paid for this' : null].filter(Boolean).join(' · ') || 'share'}
                </Text>
              </YStack>
              <Text fontSize={15} fontWeight="700" color="$color12" fontVariant={['tabular-nums']}>
                {formatMoney(s.amount, expense.currency)}
              </Text>
            </XStack>
          );
        })}
      </Card>

      {expense.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <Text fontSize={15} color="$color12">
              {expense.notes}
            </Text>
          </Card>
        </>
      ) : null}

      <Text fontSize={13} color="$color9" text="center">
        Added by {expense.createdBy.id === userId ? 'you' : expense.createdBy.name} {relativeTime(expense.createdAt)}
        {expense.updatedAt !== expense.createdAt ? ` · edited ${relativeTime(expense.updatedAt)}` : ''}
      </Text>
      {deleteError ? (
        <Text color="$red10" text="center" role="alert">
          {deleteError}
        </Text>
      ) : null}
      <XStack gap="$3">
        <Btn
          flex={1}
          variant="secondary"
          icon={<Pencil size={16} color="$color12" />}
          onPress={() =>
            router.push({
              pathname: '/groups/[id]/add-expense',
              params: { id: expense.group.id, expenseId: expense.id },
            })
          }
        >
          Edit
        </Btn>
        <Btn
          flex={1}
          variant="danger"
          icon={<Trash2 size={16} color="$red11" />}
          onPress={onDelete}
          loading={del.fetching}
          testID="delete-expense"
        >
          Delete
        </Btn>
      </XStack>
    </Screen>
  );
}
