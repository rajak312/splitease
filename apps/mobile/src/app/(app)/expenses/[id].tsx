import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailScreen } from '../../../screens/ExpenseDetailScreen';

export default function ExpenseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseDetailScreen key={id} id={id} />;
}
