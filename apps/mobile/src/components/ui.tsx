import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input, ScrollView, TextArea, useTheme, XStack, YStack, type ColorTokens, type TextProps } from 'tamagui';
import { Text } from './Text';

import { formatMoney, initials } from '../lib/format';
import { haptics } from '../lib/haptics';
import { useIsWide } from '../lib/layout';

/* ------------------------------------------------------------------ layout */

export const CONTENT_MAX_WIDTH = 880;

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  testID?: string;
}

/** Page wrapper: safe-area aware, centred column on wide web screens, optional pull-to-refresh. */
export function Screen({ children, scroll = true, refreshing = false, onRefresh, footer, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const wide = useIsWide();
  const body = (
    <YStack
      width="100%"
      maxWidth={CONTENT_MAX_WIDTH}
      self="center"
      px={wide ? '$6' : '$4'}
      pt={wide ? '$7' : '$3'}
      pb="$10"
      gap="$4"
    >
      {children}
    </YStack>
  );
  return (
    <YStack flex={1} bg="$background" pt={insets.top} testID={testID}>
      {scroll ? (
        <ScrollView
          flex={1}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.color10?.val as string}
                colors={['#059669']}
              />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <YStack flex={1}>{body}</YStack>
      )}
      {footer ? (
        <YStack
          borderTopWidth={1}
          borderColor="$borderColor"
          bg="$background"
          px="$4"
          pt="$3"
          pb={Math.max(insets.bottom, 12)}
        >
          <YStack width="100%" maxWidth={CONTENT_MAX_WIDTH} self="center">
            {footer}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

export function Header({
  title,
  subtitle,
  onBack,
  right,
  leading,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <XStack items="center" gap="$3" minH={48}>
      {onBack ? <IconButton label="Go back" onPress={onBack} icon={<BackArrow />} /> : null}
      {leading}
      <YStack flex={1} minW={0}>
        <Text fontSize={24} fontWeight="800" color="$color12" numberOfLines={1} role="heading" letterSpacing={-0.5}>
          {title}
        </Text>
        {subtitle ? (
          <Text fontSize={14} color="$color10" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {right}
    </XStack>
  );
}

function BackArrow() {
  return (
    <Text fontSize={22} color="$color12" lineHeight={22} mt={-2}>
      ←
    </Text>
  );
}

export function Card({ children, ...props }: ComponentProps<typeof YStack>) {
  return (
    <YStack bg="$color1" borderWidth={1} borderColor="$borderColor" rounded={20} p="$4" gap="$3" {...props}>
      {children}
    </YStack>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <XStack items="center" justify="space-between" mt="$2">
      <Text fontSize={13} fontWeight="700" color="$color10" textTransform="uppercase" letterSpacing={0.8}>
        {children}
      </Text>
      {right}
    </XStack>
  );
}

/* ----------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface BtnProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg' | 'sm';
  accessibilityLabel?: string;
  testID?: string;
  flex?: number;
}

const BUTTON_STYLES: Record<ButtonVariant, { bg: string; color: string; border: string; hover: string }> = {
  primary: { bg: '$green9', color: 'white', border: '$green9', hover: '$green10' },
  secondary: { bg: '$color3', color: '$color12', border: '$color4', hover: '$color4' },
  ghost: { bg: 'transparent', color: '$color12', border: 'transparent', hover: '$color3' },
  danger: { bg: '$red3', color: '$red11', border: '$red5', hover: '$red4' },
};

export function Btn({
  children,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  accessibilityLabel,
  testID,
  flex,
}: BtnProps) {
  const s = BUTTON_STYLES[variant];
  const height = size === 'lg' ? 54 : size === 'sm' ? 36 : 46;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        haptics.light();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      testID={testID}
      disabled={isDisabled}
      style={flex ? { flex } : undefined}
    >
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <XStack
          height={height}
          px={size === 'sm' ? '$3' : flex ? '$3' : '$5'}
          rounded={size === 'sm' ? 10 : 14}
          items="center"
          justify="center"
          gap="$2"
          bg={hovered || pressed ? s.hover : s.bg}
          borderWidth={1}
          borderColor={s.border}
          opacity={isDisabled ? 0.55 : 1}
          scale={pressed ? 0.98 : 1}
        >
          {loading ? <ActivityIndicator size="small" color={variant === 'primary' ? 'white' : undefined} /> : icon}
          <Text color={s.color} fontWeight="700" fontSize={size === 'sm' ? 14 : flex ? 15 : 16} numberOfLines={1}>
            {children}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={8}
    >
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <YStack
          width={40}
          height={40}
          rounded={12}
          items="center"
          justify="center"
          bg={pressed || hovered ? '$color4' : '$color3'}
        >
          {icon}
        </YStack>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ inputs */

type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
};

export function Field({ label, error, hint, multiline, ...props }: FieldProps) {
  const common = {
    size: '$4' as const,
    rounded: 12,
    bg: '$color2' as const,
    borderColor: (error ? '$red8' : '$borderColor') as ColorTokens,
    focusStyle: { borderColor: (error ? '$red9' : '$green9') as ColorTokens },
    accessibilityLabel: label,
    placeholderTextColor: '$color9' as ColorTokens,
  };
  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="600" color="$color11">
        {label}
      </Text>
      {multiline ? (
        <TextArea {...common} {...(props as ComponentProps<typeof TextArea>)} />
      ) : (
        <Input {...common} {...props} />
      )}
      {error ? (
        <Text fontSize={13} color="$red10" role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text fontSize={13} color="$color10">
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <XStack bg="$color3" rounded={14} p={4} gap={4} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={{ flex: 1 }}
            onPress={() => {
              haptics.tap();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={o.label}
            testID={`segment-${o.value}`}
          >
            <YStack
              py="$2"
              rounded={10}
              items="center"
              bg={selected ? '$color1' : 'transparent'}
              shadowColor={selected ? '$shadowColor' : 'transparent'}
              shadowRadius={selected ? 4 : 0}
              shadowOffset={{ width: 0, height: 1 }}
            >
              <Text fontSize={14} fontWeight={selected ? '700' : '500'} color={selected ? '$color12' : '$color10'}>
                {o.label}
              </Text>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

export function Chip({
  children,
  selected,
  onPress,
  testID,
}: {
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      testID={testID}
    >
      <XStack
        px="$3"
        py="$2"
        rounded={999}
        items="center"
        gap="$1.5"
        bg={selected ? '$green3' : '$color2'}
        borderWidth={1}
        borderColor={selected ? '$green8' : '$borderColor'}
      >
        {typeof children === 'string' ? (
          <Text fontSize={14} fontWeight={selected ? '700' : '500'} color={selected ? '$green11' : '$color11'}>
            {children}
          </Text>
        ) : (
          children
        )}
      </XStack>
    </Pressable>
  );
}

/* --------------------------------------------------------------- display */

export function Avatar({
  name,
  color,
  size = 40,
  emoji,
}: {
  name: string;
  color?: string;
  size?: number;
  emoji?: string;
}) {
  if (emoji) {
    return (
      <YStack width={size} height={size} rounded={size * 0.3} bg="$color3" items="center" justify="center">
        <Text fontSize={size * 0.5} lineHeight={size * 0.62}>
          {emoji}
        </Text>
      </YStack>
    );
  }
  return (
    <YStack
      width={size}
      height={size}
      rounded={size}
      bg={color ?? '#6366F1'}
      items="center"
      justify="center"
      accessibilityLabel={name}
    >
      <Text color="white" fontWeight="700" fontSize={size * 0.38}>
        {initials(name)}
      </Text>
    </YStack>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = 26,
}: {
  users: { id: string; name: string; avatarColor: string }[];
  max?: number;
  size?: number;
}) {
  const shown = users.slice(0, max);
  return (
    <XStack items="center">
      {shown.map((u, i) => (
        <YStack key={u.id} ml={i === 0 ? 0 : -size * 0.3} borderWidth={2} borderColor="$color1" rounded={size}>
          <Avatar name={u.name} color={u.avatarColor} size={size} />
        </YStack>
      ))}
      {users.length > max ? (
        <Text ml="$1.5" fontSize={12} color="$color10">
          +{users.length - max}
        </Text>
      ) : null}
    </XStack>
  );
}

export type Tone = 'positive' | 'negative' | 'neutral';

export const toneColor = (tone: Tone) =>
  tone === 'positive' ? '$green10' : tone === 'negative' ? '$red10' : '$color10';

export function Amount({
  value,
  currency,
  tone,
  ...props
}: { value: number; currency: string; tone?: Tone } & TextProps) {
  const t: Tone = tone ?? (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');
  return (
    <Text fontWeight="700" color={toneColor(t)} fontVariant={['tabular-nums']} {...props}>
      {formatMoney(Math.abs(value), currency)}
    </Text>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const bg = tone === 'positive' ? '$green3' : tone === 'negative' ? '$red3' : '$color3';
  return (
    <XStack px="$2" py={2} rounded={999} bg={bg} self="flex-start">
      <Text fontSize={12} fontWeight="700" color={toneColor(tone)}>
        {children}
      </Text>
    </XStack>
  );
}

/* ----------------------------------------------------------------- states */

export function EmptyState({
  emoji,
  title,
  message,
  action,
}: {
  emoji: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <YStack items="center" py="$8" px="$4" gap="$2">
      <Text fontSize={44}>{emoji}</Text>
      <Text fontSize={18} fontWeight="700" color="$color12" text="center">
        {title}
      </Text>
      {message ? (
        <Text fontSize={15} color="$color10" text="center" maxW={360}>
          {message}
        </Text>
      ) : null}
      {action ? <YStack mt="$3">{action}</YStack> : null}
    </YStack>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="📡"
      title="Something went wrong"
      message={message ?? 'Check your connection and try again.'}
      action={
        onRetry ? (
          <Btn variant="secondary" onPress={onRetry}>
            Try again
          </Btn>
        ) : undefined
      }
    />
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity, width }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <YStack height={height} rounded={radius} bg="$color4" />
    </Animated.View>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <YStack gap="$3" testID="skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} flexDirection="row" items="center" gap="$3">
          <Skeleton width={44} height={44} radius={14} />
          <YStack flex={1} gap="$2">
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={12} />
          </YStack>
          <Skeleton width={70} height={16} />
        </Card>
      ))}
    </YStack>
  );
}

export function Row({
  children,
  onPress,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  if (!onPress) {
    return (
      <XStack items="center" gap="$3" py="$2.5">
        {children}
      </XStack>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <XStack
          items="center"
          gap="$3"
          py="$2.5"
          px="$2"
          mx="$-2"
          rounded={14}
          bg={pressed ? '$color3' : hovered ? '$color2' : 'transparent'}
        >
          {children}
        </XStack>
      )}
    </Pressable>
  );
}
