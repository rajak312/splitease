import { Redirect } from 'expo-router';

import { useAuth } from '../lib/auth';
import { pendingRedirect } from '../lib/redirect';
import { WelcomeScreen } from '../screens/WelcomeScreen';

export default function Welcome() {
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href={(pendingRedirect.peek() ?? '/') as never} />;
  return <WelcomeScreen />;
}
