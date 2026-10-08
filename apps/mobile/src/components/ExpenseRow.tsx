import { CATEGORY_META, type ExpenseCategory } from '@splitease/shared';
import { YStack } from 'tamagui';
import { Text } from './Text';
import { useWindowDimensions } from 'react-native';

import type { ExpenseRowFieldsFragment } from '../graphql/generated/graphql';
import { firstName, formatDate, formatMoney } from '../lib/format';
import { Row } from './ui';

/** One expense line: category tile, who paid, and what it means for the viewer. */
export function ExpenseRow({
  expense,
  viewerId,
  onPress,
}: {
  expense: ExpenseRowFieldsFragment;
  viewerId: string | null;
  onPress?: () => void;
}) {
  const meta = CATEGORY_META[expense.category as ExpenseCategory] ?? CATEGORY_META.OTHER;
  const iPaid = expense.paidBy.id === viewerId;
  const lent = iPaid ? expense.amount - expense.myShare : 0;
  const borrowed = iPaid ? 0 : expense.myShare;
  const pending = expense.id.startsWith('optimistic-');
  const compact = useWindowDimensions().width < 520;

  let impact: { label: string; amount: number | null; color: string };
  if (iPaid && lent > 0) impact = { label: 'you lent', amount: lent, color: '$green10' };
  else if (borrowed > 0) impact = { label: 'you borrowed', amount: borrowed, color: '$red10' };
  else impact = { label: 'not involved', amount: null, color: '$color9' };

  return (
    <Row
      onPress={pending ? undefined : onPress}
      testID={`expense-${expense.description}`}
      accessibilityLabel={`${expense.description}, ${formatMoney(expense.amount, expense.currency)}, ${impact.label}`}
    >
      {compact ? null : (
        <YStack width={44} items="center">
          <Text fontSize={11} color="$color10" fontWeight="600">
            {formatDate(expense.date).split(' ')[1]?.toUpperCase()}
          </Text>
          <Text fontSize={18} fontWeight="700" color="$color12" lineHeight={20}>
            {formatDate(expense.date).split(' ')[0]}
          </Text>
        </YStack>
      )}
      <YStack width={42} height={42} rounded={12} items="center" justify="center" bg={`${meta.color}22`}>
        <Text fontSize={20}>{meta.emoji}</Text>
      </YStack>
      <YStack flex={1} minW={0} gap={2} opacity={pending ? 0.6 : 1}>
        <Text fontSize={15} fontWeight="600" color="$color12" numberOfLines={1}>
          {expense.description}
        </Text>
        <Text fontSize={13} color="$color10" numberOfLines={1}>
          {pending
            ? 'Saving…'
            : `${compact ? `${formatDate(expense.date)} · ` : ''}${iPaid ? 'You' : firstName(expense.paidBy.name)} paid ${formatMoney(expense.amount, expense.currency)}`}
        </Text>
      </YStack>
      <YStack items="flex-end" gap={2}>
        <Text fontSize={12} color={impact.color}>
          {impact.label}
        </Text>
        {impact.amount !== null ? (
          <Text fontSize={15} fontWeight="700" color={impact.color} fontVariant={['tabular-nums']}>
            {formatMoney(impact.amount, expense.currency)}
          </Text>
        ) : null}
      </YStack>
    </Row>
  );
}
