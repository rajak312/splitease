import {
  CATEGORY_META,
  computeSplit,
  currencyInfo,
  EXPENSE_CATEGORIES,
  expenseSchema,
  fieldErrors,
  formatBasisPoints,
  parseMoney,
  parsePercentToBasisPoints,
  PERCENT_TOTAL_BP,
  toDecimalString,
  type ExpenseCategory,
  type SplitMode,
  type SplitParticipantInput,
} from '@splitease/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, useWindowDimensions } from 'react-native';
import { Input, XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation, useQuery } from 'urql';

import { Check } from '../components/icons';
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
  Segmented,
} from '../components/ui';
import { CreateExpenseMutation, ExpenseQuery, GroupQuery, UpdateExpenseMutation } from '../graphql/documents';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { firstName, formatMoney, fromDateInput, toDateInput } from '../lib/format';
import { haptics } from '../lib/haptics';

const MODES: { value: SplitMode; label: string; hint: string }[] = [
  {
    value: 'EQUAL',
    label: 'Equally',
    hint: 'Everyone selected pays the same; any leftover paisa is assigned deterministically so totals always match.',
  },
  { value: 'EXACT', label: 'Exact', hint: 'Enter exactly how much each person owes.' },
  { value: 'PERCENT', label: 'Percent', hint: 'Percentages must add up to 100%.' },
  { value: 'SHARES', label: 'Shares', hint: 'Split by weight, e.g. 2 shares for a couple.' },
];

export interface ExpenseFormMember {
  id: string;
  name: string;
  avatarColor: string;
}

/** Turn the per-person text inputs into the shared split input (minor units / bp / weights). */
export function buildParticipants(
  mode: SplitMode,
  members: ExpenseFormMember[],
  included: Set<string>,
  values: Record<string, string>,
  currency: string,
): SplitParticipantInput[] {
  return members
    .filter((m) => included.has(m.id))
    .map((m) => {
      const raw = (values[m.id] ?? '').trim();
      if (mode === 'EQUAL') return { userId: m.id };
      if (raw === '') return { userId: m.id, value: 0 };
      const parsed =
        mode === 'EXACT'
          ? parseMoney(raw, currency)
          : mode === 'PERCENT'
            ? parsePercentToBasisPoints(raw)
            : /^\d+$/.test(raw)
              ? Number(raw)
              : null;
      return { userId: m.id, value: parsed ?? -1 };
    });
}

function initialValues(mode: SplitMode, members: ExpenseFormMember[]) {
  const out: Record<string, string> = {};
  if (mode === 'SHARES') for (const m of members) out[m.id] = '1';
  if (mode === 'PERCENT' && members.length > 0) {
    // Pre-fill an even split in basis points; remainder to the first members.
    const base = Math.floor(PERCENT_TOTAL_BP / members.length);
    let extra = PERCENT_TOTAL_BP - base * members.length;
    for (const m of members) {
      out[m.id] = formatBasisPoints(base + (extra > 0 ? 1 : 0));
      extra -= 1;
    }
  }
  return out;
}

export function ExpenseForm({
  groupId,
  currency,
  members,
  viewerId,
  initial,
  submitting,
  serverError,
  onSubmit,
}: {
  groupId: string;
  currency: string;
  members: ExpenseFormMember[];
  viewerId: string | null;
  initial?: {
    description: string;
    amount: number;
    paidById: string;
    category: ExpenseCategory;
    date: string;
    notes: string | null;
    splitMode: SplitMode;
    shares: { userId: string; value: number | null }[];
  };
  submitting?: boolean;
  serverError?: { message: string; fields: Record<string, string> } | null;
  onSubmit: (input: {
    description: string;
    amount: number;
    paidById: string;
    category: ExpenseCategory;
    date: string;
    notes: string | null;
    splitMode: SplitMode;
    participants: SplitParticipantInput[];
  }) => void;
}) {
  const info = currencyInfo(currency);
  const compact = useWindowDimensions().width < 520;
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amountText, setAmountText] = useState(initial ? toDecimalString(initial.amount, currency) : '');
  const [paidById, setPaidById] = useState(initial?.paidById ?? viewerId ?? members[0]?.id ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? 'FOOD');
  const [dateText, setDateText] = useState(toDateInput(initial ? new Date(initial.date) : new Date()));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [mode, setMode] = useState<SplitMode>(initial?.splitMode ?? 'EQUAL');
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(initial ? initial.shares.map((s) => s.userId) : members.map((m) => m.id)),
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initial || initial.splitMode === 'EQUAL') return {};
    const out: Record<string, string> = {};
    for (const s of initial.shares) {
      if (s.value === null) continue;
      out[s.userId] =
        initial.splitMode === 'EXACT'
          ? toDecimalString(s.value, currency)
          : initial.splitMode === 'PERCENT'
            ? formatBasisPoints(s.value)
            : String(s.value);
    }
    return out;
  });
  const [localErrors, setErrors] = useState<Record<string, string>>({});
  // Client-side validation errors win; otherwise show field errors from the API.
  const errors = Object.keys(localErrors).length > 0 ? localErrors : (serverError?.fields ?? {});
  const [{ today, yesterday }] = useState(() => {
    const now = new Date();
    const prev = new Date(now);
    prev.setDate(now.getDate() - 1);
    return { today: toDateInput(now), yesterday: toDateInput(prev) };
  });

  const changeMode = (next: SplitMode) => {
    setMode(next);
    setValues(
      next === 'EQUAL' || next === 'EXACT'
        ? {}
        : initialValues(
            next,
            members.filter((m) => included.has(m.id)),
          ),
    );
  };

  const amount = parseMoney(amountText, currency);
  const participants = buildParticipants(mode, members, included, values, currency);
  // Cheap pure computation — the same function the server runs.
  const split = amount && amount > 0 ? computeSplit(amount, mode, participants) : null;
  const shareOf = (id: string) => (split?.ok ? split.shares.find((s) => s.userId === id)?.amount : undefined);

  let status: { text: string; ok: boolean } | null = null;
  if (split) {
    if (split.ok) status = { text: 'Split adds up ✓', ok: true };
    else if (mode === 'EXACT' && split.remaining !== undefined)
      status = {
        text:
          split.remaining > 0
            ? `${formatMoney(split.remaining, currency)} left to assign`
            : `${formatMoney(-split.remaining, currency)} over the total`,
        ok: false,
      };
    else if (mode === 'PERCENT' && split.remaining !== undefined)
      status = {
        text:
          split.remaining > 0
            ? `${formatBasisPoints(split.remaining)}% left`
            : `${formatBasisPoints(-split.remaining)}% over 100%`,
        ok: false,
      };
    else status = { text: split.error, ok: false };
  }

  const submit = () => {
    const date = fromDateInput(dateText);
    const input = {
      description,
      amount: amount ?? Number.NaN,
      paidById,
      category,
      date: date ? date.toISOString() : 'invalid',
      notes: notes.trim() ? notes.trim() : null,
      splitMode: mode,
      participants,
    };
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success || !date) {
      haptics.warning();
      const fe = parsed.success ? {} : fieldErrors(parsed.error);
      if (!date) fe.date = 'Use the format YYYY-MM-DD';
      if (amount === null)
        fe.amount = amountText.trim() ? `Enter a valid amount (max ${info.decimals} decimals)` : 'Enter an amount';
      setErrors(fe);
      return;
    }
    setErrors({});
    onSubmit({ ...input, date: date.toISOString() });
  };

  const toggle = (id: string) => {
    haptics.tap();
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <YStack gap="$4" testID={`expense-form-${groupId}`}>
      <Card gap="$4">
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Dinner at Toit"
          error={errors.description}
          testID="description-input"
          maxLength={120}
        />
        <YStack gap="$1.5">
          <Text fontSize={14} fontWeight="600" color="$color11">
            Amount
          </Text>
          <XStack
            items="center"
            gap="$2"
            bg="$color2"
            rounded={14}
            borderWidth={1}
            borderColor={errors.amount ? '$red8' : '$borderColor'}
            px="$4"
          >
            <Text fontSize={28} fontWeight="800" color="$color10">
              {info.symbol}
            </Text>
            <Input
              flex={1}
              unstyled
              value={amountText}
              onChangeText={setAmountText}
              placeholder={info.decimals ? '0.00' : '0'}
              keyboardType="decimal-pad"
              inputMode="decimal"
              fontSize={32}
              fontWeight="800"
              color="$color12"
              height={64}
              placeholderTextColor="$color8"
              accessibilityLabel={`Amount in ${currency}`}
              testID="amount-input"
            />
          </XStack>
          {errors.amount ? (
            <Text fontSize={13} color="$red10" role="alert">
              {errors.amount}
            </Text>
          ) : null}
        </YStack>

        <YStack gap="$2">
          <Text fontSize={14} fontWeight="600" color="$color11">
            Paid by
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {members.map((m) => (
              <Chip key={m.id} selected={paidById === m.id} onPress={() => setPaidById(m.id)} testID={`payer-${m.id}`}>
                <Avatar name={m.name} color={m.avatarColor} size={22} />
                <Text
                  fontSize={14}
                  fontWeight={paidById === m.id ? '700' : '500'}
                  color={paidById === m.id ? '$green11' : '$color11'}
                >
                  {m.id === viewerId ? 'You' : firstName(m.name)}
                </Text>
              </Chip>
            ))}
          </XStack>
        </YStack>
      </Card>

      <SectionTitle>Split</SectionTitle>
      <Card gap="$3">
        <Segmented<SplitMode> label="Split mode" value={mode} onChange={changeMode} options={MODES} />
        <Text fontSize={13} color="$color10">
          {MODES.find((m) => m.value === mode)?.hint}
        </Text>
        <YStack>
          {members.map((m) => {
            const on = included.has(m.id);
            const share = on ? shareOf(m.id) : undefined;
            return (
              <XStack key={m.id} items="center" gap="$3" py="$2" borderTopWidth={1} borderColor="$borderColor">
                <Pressable
                  onPress={() => toggle(m.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Include ${m.name}`}
                  testID={`include-${m.id}`}
                  hitSlop={6}
                >
                  <YStack
                    width={24}
                    height={24}
                    rounded={7}
                    items="center"
                    justify="center"
                    bg={on ? '$green9' : 'transparent'}
                    borderWidth={2}
                    borderColor={on ? '$green9' : '$color7'}
                  >
                    {on ? <Check size={14} color="white" strokeWidth={3} /> : null}
                  </YStack>
                </Pressable>
                {compact ? null : <Avatar name={m.name} color={m.avatarColor} size={32} />}
                <Text flex={1} fontSize={15} color={on ? '$color12' : '$color9'} numberOfLines={1}>
                  {m.id === viewerId ? 'You' : compact ? firstName(m.name) : m.name}
                </Text>
                {mode !== 'EQUAL' && on ? (
                  <XStack
                    items="center"
                    gap="$1"
                    bg="$color2"
                    rounded={10}
                    px="$2"
                    borderWidth={1}
                    borderColor="$borderColor"
                    width={compact ? 92 : 110}
                  >
                    {mode === 'EXACT' ? <Text color="$color10">{info.symbol}</Text> : null}
                    <Input
                      unstyled
                      flex={1}
                      height={38}
                      textAlign="right"
                      value={values[m.id] ?? ''}
                      onChangeText={(t: string) => setValues((v) => ({ ...v, [m.id]: t }))}
                      keyboardType={mode === 'SHARES' ? 'number-pad' : 'decimal-pad'}
                      inputMode={mode === 'SHARES' ? 'numeric' : 'decimal'}
                      placeholder="0"
                      placeholderTextColor="$color8"
                      color="$color12"
                      fontSize={15}
                      accessibilityLabel={`${mode === 'EXACT' ? 'Amount' : mode === 'PERCENT' ? 'Percent' : 'Shares'} for ${m.name}`}
                      testID={`value-${m.id}`}
                    />
                    {mode === 'PERCENT' ? (
                      <Text color="$color10">%</Text>
                    ) : mode === 'SHARES' ? (
                      <Text color="$color10">×</Text>
                    ) : null}
                  </XStack>
                ) : null}
                <Text
                  width={compact ? 80 : 92}
                  text="right"
                  fontSize={15}
                  fontWeight="700"
                  color={share ? '$color12' : '$color8'}
                  fontVariant={['tabular-nums']}
                  testID={`share-${m.id}`}
                >
                  {on && share !== undefined ? formatMoney(share, currency) : '—'}
                </Text>
              </XStack>
            );
          })}
        </YStack>
        {status ? (
          <XStack bg={status.ok ? '$green3' : '$orange3'} rounded={12} px="$3" py="$2.5" testID="split-status">
            <Text
              fontSize={14}
              fontWeight="600"
              color={status.ok ? '$green11' : '$orange11'}
              role={status.ok ? undefined : 'alert'}
            >
              {status.text}
            </Text>
          </XStack>
        ) : null}
        {errors.participants && !status ? (
          <Text fontSize={13} color="$red10" role="alert">
            {errors.participants}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card gap="$4">
        <YStack gap="$2">
          <Text fontSize={14} fontWeight="600" color="$color11">
            Category
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} selected={category === c} onPress={() => setCategory(c)} testID={`category-${c}`}>
                {`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
              </Chip>
            ))}
          </XStack>
        </YStack>
        <YStack gap="$2">
          <XStack gap="$2">
            <Chip selected={dateText === today} onPress={() => setDateText(today)}>
              Today
            </Chip>
            <Chip selected={dateText === yesterday} onPress={() => setDateText(yesterday)}>
              Yesterday
            </Chip>
          </XStack>
          <Field
            label="Date"
            value={dateText}
            onChangeText={setDateText}
            placeholder="YYYY-MM-DD"
            error={errors.date}
            testID="date-input"
          />
        </YStack>
        <Field
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          multiline
          numberOfLines={3}
          error={errors.notes}
          maxLength={500}
        />
      </Card>

      {serverError && Object.keys(serverError.fields).length === 0 ? (
        <Text color="$red10" fontSize={14} role="alert">
          {serverError.message}
        </Text>
      ) : null}
      <Btn size="lg" onPress={submit} loading={submitting} testID="save-expense">
        {initial ? 'Save changes' : 'Add expense'}
      </Btn>
    </YStack>
  );
}

export function ExpenseFormScreen({ groupId, expenseId }: { groupId: string; expenseId?: string }) {
  const router = useRouter();
  const { userId } = useAuth();
  const [{ data, error }] = useQuery({ query: GroupQuery, variables: { id: groupId } });
  const [{ data: existing }] = useQuery({ query: ExpenseQuery, variables: { id: expenseId ?? '' }, pause: !expenseId });
  const [create, runCreate] = useMutation(CreateExpenseMutation);
  const [update, runUpdate] = useMutation(UpdateExpenseMutation);
  const [serverError, setServerError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/groups/${groupId}`));
  const group = data?.group;
  const expense = existing?.expense;

  const onSubmit: Parameters<typeof ExpenseForm>[0]['onSubmit'] = async (input) => {
    setServerError(null);
    const result = expenseId ? await runUpdate({ id: expenseId, input }) : await runCreate({ groupId, input });
    if (result.error) {
      haptics.error();
      setServerError(errorInfo(result.error));
      return;
    }
    haptics.success();
    close();
  };

  const ready = group && (!expenseId || expense);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Header
          title={expenseId ? 'Edit expense' : 'Add expense'}
          subtitle={group ? `${group.emoji} ${group.name}` : undefined}
          onBack={close}
        />
        {!ready ? (
          error ? (
            <ErrorState message={errorInfo(error)?.message} />
          ) : (
            <ListSkeleton rows={3} />
          )
        ) : (
          <ExpenseForm
            groupId={groupId}
            currency={group.currency}
            members={group.members.map((m) => m.user)}
            viewerId={userId}
            submitting={create.fetching || update.fetching}
            serverError={serverError}
            initial={
              expense
                ? {
                    description: expense.description,
                    amount: expense.amount,
                    paidById: expense.paidBy.id,
                    category: expense.category as ExpenseCategory,
                    date: expense.date,
                    notes: expense.notes,
                    splitMode: expense.splitMode as SplitMode,
                    shares: expense.shares.map((s) => ({ userId: s.user.id, value: s.value })),
                  }
                : undefined
            }
            onSubmit={onSubmit}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
