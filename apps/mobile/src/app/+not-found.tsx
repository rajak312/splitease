import { Link } from 'expo-router';
import { YStack } from 'tamagui';
import { Text } from '../components/Text';

export default function NotFound() {
  return (
    <YStack flex={1} items="center" justify="center" gap="$3" bg="$background" p="$5">
      <Text fontSize={48}>🧭</Text>
      <Text fontSize={22} fontWeight="800" color="$color12">
        Page not found
      </Text>
      <Link href="/">
        <Text color="$green10" fontWeight="700" fontSize={16}>
          Go to your groups
        </Text>
      </Link>
    </YStack>
  );
}
