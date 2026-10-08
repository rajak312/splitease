import { XStack, YStack } from 'tamagui';
import { Text } from './Text';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <YStack
      width={size}
      height={size}
      rounded={size * 0.3}
      bg="$green9"
      items="center"
      justify="center"
      accessibilityLabel="SplitEase logo"
    >
      <Text color="white" fontWeight="800" fontSize={size * 0.5} lineHeight={size * 0.6}>
        ÷
      </Text>
    </YStack>
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <XStack items="center" gap="$2.5">
      <Logo size={size} />
      <Text fontSize={size * 0.6} fontWeight="800" color="$color12" letterSpacing={-0.5}>
        Split
        <Text color="$green10" fontSize={size * 0.6} fontWeight="800">
          Ease
        </Text>
      </Text>
    </XStack>
  );
}
