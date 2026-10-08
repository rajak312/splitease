import { currencyInfo, parseMoney, settlementSchema, toDecimalString, fieldErrors } from '@splitease/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation, useQuery } from 'urql';

import { ArrowRight } from '../components/icons';
import {
  Avatar,
  Btn,
  Card,
  Chip,
  ErrorState,
  Field,
  Header,
  ListSkeleton,
  Screen,
  SectionTitle,
} from '../components/ui';
import { GroupQuery, SettleUpMutation } from '../graphql/documents';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { firstName, formatMoney } from '../lib/format';
import { haptics } from '../lib/haptics';

interface PickerMember {
  id: string;
  name: string;
  avatarColor: string;
}

function PersonPicker({
  label,
  value,
  onChange,
  members,
  nameOf,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  members: PickerMember[];
  nameOf: (id: string) => string;
  exclude?: string;
}) {
  return (
    <YStack gap="$2">
      <Text fontSize={14} fontWeight="600" color="$color11">
        {label}
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        {members
          .filter((m) => m.id !== exclude)
          .map((m) => (
            <Chip key={m.id} selected={value === m.id} onPress={() => onChange(m.id)}>
              <Avatar name={m.name} color={m.avatarColor} size={22} />
              <Text
                fontSize={14}
                color={value === m.id ? '$green11' : '$color11'}
                fontWeight={value === m.id ? '700' : '500'}
              >
                {nameOf(m.id)}
              </Text>
            </Chip>
          ))}
      </XStack>
    </YStack>
  );
}

export function SettleScreen({
  groupId,
  from,
  to,
  amount,
}: {
  groupId: string;
  from?: string;
  to?: string;
  amount?: string;
}) {
  const router = useRouter();
  const { userId } = useAuth();
  const [{ data, error }] = useQuery({ query: GroupQuery, variables: { id: groupId } });
  const [state, settle] = useMutation(SettleUpMutation);
  const group = data?.group;
  const myDebt = group?.simplifiedDebts.find((d) => d.from.id === userId) ?? group?.simplifiedDebts[0];
  const [fromId, setFromId] = useState<string | undefined>(from);
  const [toId, setToId] = useState<string | undefined>(to);
  const [amountText, setAmountText] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/groups/${groupId}`));

  if (!group) {
    return (
      <Screen>
        <Header title="Settle up" onBack={close} />
        {error ? <ErrorState message={errorInfo(error)?.message} /> : <ListSkeleton rows={2} />}
      </Screen>
    );
  }

  const payer = fromId ?? myDebt?.from.id ?? userId ?? '';
  const receiver = toId ?? myDebt?.to.id ?? group.members.find((m) => m.user.id !== payer)?.user.id ?? '';
  const suggested = group.simplifiedDebts.find((d) => d.from.id === payer && d.to.id === receiver)?.amount;
  const text =
    amountText ??
    (amount
      ? toDecimalString(Number(amount), group.currency)
      : suggested
        ? toDecimalString(suggested, group.currency)
        : '');
  const members = group.members.map((m) => m.user);
  const name = (id: string) => (id === userId ? 'You' : firstName(members.find((m) => m.id === id)?.name ?? ''));

  const submit = async () => {
    const minor = parseMoney(text, group.currency);
    const parsed = settlementSchema.safeParse({
      fromUserId: payer,
      toUserId: receiver,
      amount: minor ?? Number.NaN,
      note: note || null,
    });
    if (!parsed.success) {
      haptics.warning();
      setErrors(fieldErrors(parsed.error));
      return;
    }
    const result = await settle({
      groupId,
      input: { fromUserId: payer, toUserId: receiver, amount: parsed.data.amount, note: note || null },
    });
    if (result.error) {
      haptics.error();
      setErrors({ _form: errorInfo(result.error)?.message ?? 'Could not record payment' });
      return;
    }
    haptics.success();
    close();
  };

  return (
    <Screen>
      <Header title="Settle up" subtitle={`${group.emoji} ${group.name}`} onBack={close} />
      <Card items="center" gap="$3" py="$5">
        <XStack items="center" gap="$4">
          <YStack items="center" gap="$1">
            <Avatar
              name={members.find((m) => m.id === payer)?.name ?? '?'}
              color={members.find((m) => m.id === payer)?.avatarColor}
              size={56}
            />
            <Text fontWeight="700" color="$color12">
              {name(payer)}
            </Text>
          </YStack>
          <ArrowRight size={24} color="$green10" />
          <YStack items="center" gap="$1">
            <Avatar
              name={members.find((m) => m.id === receiver)?.name ?? '?'}
              color={members.find((m) => m.id === receiver)?.avatarColor}
              size={56}
            />
            <Text fontWeight="700" color="$color12">
              {name(receiver)}
            </Text>
          </YStack>
        </XStack>
        {suggested ? (
          <Text fontSize={14} color="$color10">
            Suggested: {formatMoney(suggested, group.currency)} settles this pair
          </Text>
        ) : null}
      </Card>
      <SectionTitle>Payment</SectionTitle>
      <Card gap="$4">
        <PersonPicker
          label="Who paid?"
          value={payer}
          members={members}
          nameOf={name}
          onChange={(id) => {
            setFromId(id);
            setAmountText(undefined);
            if (id === receiver) setToId(undefined);
          }}
        />
        <PersonPicker
          label="Who received it?"
          value={receiver}
          members={members}
          nameOf={name}
          exclude={payer}
          onChange={(id) => {
            setToId(id);
            setAmountText(undefined);
          }}
        />
        <Field
          label={`Amount (${currencyInfo(group.currency).symbol})`}
          value={text}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.00"
          error={errors.amount ?? errors.toUserId}
          testID="settle-amount"
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="UPI, cash, bank transfer…"
          maxLength={200}
        />
        {errors._form ? (
          <Text color="$red10" role="alert">
            {errors._form}
          </Text>
        ) : null}
        <Btn size="lg" onPress={submit} loading={state.fetching} testID="record-payment">
          Record payment
        </Btn>
      </Card>
    </Screen>
  );
}
