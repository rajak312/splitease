import { inviteCodeSchema } from '@splitease/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation, useQuery } from 'urql';

import { Avatar, Btn, Card, EmptyState, Field, Header, Screen, Skeleton } from '../components/ui';
import { InvitePreviewQuery, JoinGroupMutation } from '../graphql/documents';
import { errorInfo } from '../lib/errors';
import { haptics } from '../lib/haptics';
import { pendingRedirect } from '../lib/redirect';

/** Handles splitease://join/CODE, https://…/join/CODE and manual code entry. */
export function JoinScreen({ code: initialCode }: { code?: string }) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [{ data, fetching, error }] = useQuery({
    query: InvitePreviewQuery,
    variables: { code: code ?? '' },
    pause: !code,
    requestPolicy: 'network-only',
  });
  const [join, runJoin] = useMutation(JoinGroupMutation);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const preview = data?.invitePreview;

  useEffect(() => pendingRedirect.clear(), []);

  const lookUp = () => {
    const parsed = inviteCodeSchema.safeParse(input);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? 'Invalid code');
      return;
    }
    setInputError(null);
    setCode(parsed.data);
  };

  const accept = async () => {
    if (!code) return;
    const result = await runJoin({ code });
    if (result.data?.joinGroup) {
      haptics.success();
      router.replace(`/groups/${result.data.joinGroup.id}`);
    } else haptics.error();
  };

  return (
    <Screen>
      <Header title="Join a group" subtitle="Use an invite link or code from a friend" onBack={close} />
      {!code ? (
        <Card gap="$4">
          <Field
            label="Invite code"
            value={input}
            onChangeText={(t: string) => setInput(t.toUpperCase())}
            placeholder="e.g. K7M2QX9P"
            autoCapitalize="characters"
            error={inputError}
            onSubmitEditing={lookUp}
            testID="invite-code"
          />
          <Btn onPress={lookUp}>Find group</Btn>
        </Card>
      ) : fetching && !preview ? (
        <Card gap="$3">
          <Skeleton height={64} width={64} radius={20} />
          <Skeleton width="60%" />
        </Card>
      ) : preview ? (
        <Card items="center" gap="$3" py="$6">
          <Avatar name={preview.name} emoji={preview.emoji} size={72} />
          <Text fontSize={22} fontWeight="800" color="$color12">
            {preview.name}
          </Text>
          <Text fontSize={15} color="$color10">
            {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'} · {preview.currency}
          </Text>
          <YStack width="100%" maxW={320} mt="$3" gap="$2">
            {preview.alreadyMember ? (
              <Btn onPress={() => router.replace(`/groups/${preview.groupId}`)}>You’re already in — open group</Btn>
            ) : (
              <Btn size="lg" onPress={accept} loading={join.fetching} testID="accept-invite">
                Join group
              </Btn>
            )}
            {join.error ? (
              <Text color="$red10" text="center" role="alert">
                {errorInfo(join.error)?.message}
              </Text>
            ) : null}
          </YStack>
        </Card>
      ) : (
        <EmptyState
          emoji="🔗"
          title="Invite not found"
          message={
            error
              ? errorInfo(error)?.code === 'NOT_FOUND'
                ? 'This invite link is invalid or has been reset.'
                : errorInfo(error)?.message
              : undefined
          }
          action={
            <Btn variant="secondary" onPress={() => setCode(null)}>
              Enter a different code
            </Btn>
          }
        />
      )}
    </Screen>
  );
}
