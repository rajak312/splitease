import { useLocalSearchParams } from 'expo-router';

import { SettleScreen } from '../../../../screens/SettleScreen';

export default function SettleRoute() {
  const { id, from, to, amount } = useLocalSearchParams<{ id: string; from?: string; to?: string; amount?: string }>();
  return <SettleScreen groupId={id} from={from} to={to} amount={amount} />;
}
