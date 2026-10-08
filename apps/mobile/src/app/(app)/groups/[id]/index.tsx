import { useLocalSearchParams } from 'expo-router';

import { GroupScreen } from '../../../../screens/GroupScreen';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupScreen key={id} id={id} />;
}
