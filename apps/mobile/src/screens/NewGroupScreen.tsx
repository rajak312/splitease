import { CURRENCIES, CURRENCY_CODES, fieldErrors, GROUP_EMOJIS, groupSchema } from '@splitease/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation } from 'urql';

import { Btn, Card, Chip, Field, Header, Screen } from '../components/ui';
import { CreateGroupMutation } from '../graphql/documents';
import { errorInfo } from '../lib/errors';
import { haptics } from '../lib/haptics';

export function NewGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(GROUP_EMOJIS[0]);
  const [currency, setCurrency] = useState('INR');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, create] = useMutation(CreateGroupMutation);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    const parsed = groupSchema.safeParse({ name, emoji, currency });
    if (!parsed.success) {
      haptics.warning();
      setErrors(fieldErrors(parsed.error));
      return;
    }
    const result = await create({ input: parsed.data });
    if (!result.data?.createGroup) {
      haptics.error();
      const info = errorInfo(result.error);
      setErrors({ ...(info?.fields ?? {}), _form: info?.message ?? '' });
      return;
    }
    haptics.success();
    router.replace(`/groups/${result.data.createGroup.id}`);
  };

  return (
    <Screen>
      <Header title="New group" subtitle="Trips, flats, teams — anything you share" onBack={close} />
      <Card gap="$4">
        <XStack items="center" gap="$3">
          <YStack width={64} height={64} rounded={20} bg="$color3" items="center" justify="center">
            <Text fontSize={34}>{emoji}</Text>
          </YStack>
          <YStack flex={1}>
            <Field
              label="Group name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Goa Trip"
              error={errors.name}
              maxLength={60}
              testID="group-name"
            />
          </YStack>
        </XStack>
        <YStack gap="$2">
          <Text fontSize={14} fontWeight="600" color="$color11">
            Icon
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {GROUP_EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => (haptics.tap(), setEmoji(e))}
                accessibilityRole="button"
                accessibilityLabel={`Icon ${e}`}
                accessibilityState={{ selected: emoji === e }}
              >
                <YStack
                  width={46}
                  height={46}
                  rounded={14}
                  items="center"
                  justify="center"
                  bg={emoji === e ? '$green3' : '$color2'}
                  borderWidth={2}
                  borderColor={emoji === e ? '$green8' : 'transparent'}
                >
                  <Text fontSize={22}>{e}</Text>
                </YStack>
              </Pressable>
            ))}
          </XStack>
        </YStack>
        <YStack gap="$2">
          <Text fontSize={14} fontWeight="600" color="$color11">
            Currency
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {CURRENCY_CODES.map((c) => (
              <Chip key={c} selected={currency === c} onPress={() => setCurrency(c)} testID={`currency-${c}`}>
                {`${CURRENCIES[c].symbol} ${c}`}
              </Chip>
            ))}
          </XStack>
          <Text fontSize={13} color="$color10">
            All expenses in this group use {CURRENCIES[currency as keyof typeof CURRENCIES]?.name ?? currency}. It can
            be changed until the first expense is added.
          </Text>
        </YStack>
        {errors._form ? (
          <Text color="$red10" role="alert">
            {errors._form}
          </Text>
        ) : null}
        <Btn size="lg" onPress={submit} loading={state.fetching} testID="create-group">
          Create group
        </Btn>
      </Card>
    </Screen>
  );
}
