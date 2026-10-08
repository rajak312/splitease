import { XStack, YStack } from 'tamagui';
import { Text } from './Text';

import type { GroupCardFieldsFragment } from '../graphql/generated/graphql';
import { balanceLabel, formatMoney } from '../lib/format';
import { ChevronRight } from './icons';
import { Avatar, AvatarStack, Card, Row, toneColor } from './ui';

export function GroupCard({ group, onPress }: { group: GroupCardFieldsFragment; onPress: () => void }) {
  const { tone } = balanceLabel(group.myBalance, group.currency);
  const label = tone === 'positive' ? 'you are owed' : tone === 'negative' ? 'you owe' : 'settled up';
  return (
    <Card py="$2" px="$4" gap={0}>
      <Row
        onPress={onPress}
        testID={`group-${group.name}`}
        accessibilityLabel={`${group.name}, ${label}${tone === 'neutral' ? '' : ` ${formatMoney(Math.abs(group.myBalance), group.currency)}`}`}
      >
        <Avatar name={group.name} emoji={group.emoji} size={48} />
        <YStack flex={1} gap="$1" minW={0}>
          <Text fontSize={16} fontWeight="700" color="$color12" numberOfLines={1} text="left">
            {group.name}
          </Text>
          <XStack items="center" gap="$2">
            <AvatarStack users={group.members.map((m) => m.user)} size={20} max={3} />
            <Text fontSize={13} color="$color10" numberOfLines={1} flexShrink={1}>
              {group.memberCount} members
            </Text>
          </XStack>
        </YStack>
        <YStack items="flex-end" gap={2}>
          <Text fontSize={12} color={toneColor(tone)}>
            {label}
          </Text>
          {tone !== 'neutral' ? (
            <Text fontSize={16} fontWeight="800" color={toneColor(tone)} fontVariant={['tabular-nums']}>
              {formatMoney(Math.abs(group.myBalance), group.currency)}
            </Text>
          ) : null}
        </YStack>
        <ChevronRight size={18} color="$color9" />
      </Row>
    </Card>
  );
}
