import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { ScrollView, XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { useQuery } from 'urql';

import { DashboardQuery, MeQuery } from '../graphql/documents';
import { balanceLabel } from '../lib/format';
import { Wordmark } from './Brand';
import { Activity, House, Plus, User } from './icons';
import { Avatar, toneColor } from './ui';

function NavItem({
  label,
  icon,
  active,
  onPress,
  trailing,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      {({ hovered }: { pressed: boolean; hovered?: boolean }) => (
        <XStack
          items="center"
          gap="$3"
          px="$3"
          py="$2.5"
          rounded={12}
          bg={active ? '$green3' : hovered ? '$color3' : 'transparent'}
        >
          {icon}
          <Text
            flex={1}
            fontSize={15}
            fontWeight={active ? '700' : '500'}
            color={active ? '$green11' : '$color11'}
            numberOfLines={1}
          >
            {label}
          </Text>
          {trailing}
        </XStack>
      )}
    </Pressable>
  );
}

/** Desktop / tablet navigation: main sections plus a live list of the user's groups. */
export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [{ data }] = useQuery({ query: DashboardQuery });
  const [{ data: me }] = useQuery({ query: MeQuery });

  const iconColor = (active: boolean) => (active ? '$green11' : '$color10');

  return (
    <YStack width={280} borderRightWidth={1} borderColor="$borderColor" bg="$color1" py="$5" px="$3" gap="$5">
      <XStack px="$2">
        <Wordmark size={32} />
      </XStack>

      <YStack gap="$1">
        <NavItem
          label="Groups"
          active={pathname === '/'}
          onPress={() => router.navigate('/')}
          icon={<House size={19} color={iconColor(pathname === '/')} />}
        />
        <NavItem
          label="Activity"
          active={pathname === '/activity'}
          onPress={() => router.navigate('/activity')}
          icon={<Activity size={19} color={iconColor(pathname === '/activity')} />}
        />
        <NavItem
          label="Account"
          active={pathname === '/account'}
          onPress={() => router.navigate('/account')}
          icon={<User size={19} color={iconColor(pathname === '/account')} />}
        />
      </YStack>

      <YStack flex={1} gap="$2" minH={0}>
        <XStack items="center" justify="space-between" px="$3">
          <Text fontSize={12} fontWeight="700" color="$color10" letterSpacing={0.8}>
            YOUR GROUPS
          </Text>
          <Pressable
            onPress={() => router.navigate('/groups/new')}
            accessibilityRole="button"
            accessibilityLabel="New group"
            hitSlop={8}
          >
            <Plus size={18} color="$color10" />
          </Pressable>
        </XStack>
        <ScrollView flex={1}>
          <YStack gap="$1">
            {(data?.groups ?? []).map((g) => {
              const path = `/groups/${g.id}`;
              const active = pathname.startsWith(path);
              const { tone } = balanceLabel(g.myBalance, g.currency);
              return (
                <NavItem
                  key={g.id}
                  label={g.name}
                  active={active}
                  onPress={() => router.navigate(path as never)}
                  icon={<Text fontSize={18}>{g.emoji}</Text>}
                  trailing={
                    <YStack
                      width={8}
                      height={8}
                      rounded={8}
                      bg={toneColor(tone)}
                      opacity={tone === 'neutral' ? 0.4 : 1}
                    />
                  }
                />
              );
            })}
          </YStack>
        </ScrollView>
      </YStack>

      {me?.me ? (
        <XStack items="center" gap="$3" px="$2" pt="$3" borderTopWidth={1} borderColor="$borderColor">
          <Avatar name={me.me.name} color={me.me.avatarColor} size={36} />
          <YStack flex={1} minW={0}>
            <Text fontSize={14} fontWeight="700" color="$color12" numberOfLines={1}>
              {me.me.name}
            </Text>
            <Text fontSize={12} color="$color10" numberOfLines={1}>
              {me.me.isDemo ? 'Demo sandbox' : me.me.email}
            </Text>
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  );
}
