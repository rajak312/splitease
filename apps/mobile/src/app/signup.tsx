import { Redirect } from 'expo-router';

import { useAuth } from '../lib/auth';
import { pendingRedirect } from '../lib/redirect';
import { AuthFormScreen } from '../screens/AuthFormScreen';

export default function SignUp() {
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href={(pendingRedirect.peek() ?? '/') as never} />;
  return <AuthFormScreen mode="signup" />;
}
