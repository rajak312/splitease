import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '../../../../screens/ExpenseFormScreen';

export default function AddExpenseRoute() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  return <ExpenseFormScreen key={expenseId ?? 'new'} groupId={id} expenseId={expenseId} />;
}
