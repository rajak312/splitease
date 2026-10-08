import { useLocalSearchParams } from 'expo-router';

import { JoinScreen } from '../../../screens/JoinScreen';

export default function JoinCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinScreen key={code} code={code} />;
}
