import { fieldErrors, loginSchema, signUpSchema } from '@splitease/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Text } from '../components/Text';
import { useMutation } from 'urql';

import { Wordmark } from '../components/Brand';
import { Btn, Card, Field, Screen } from '../components/ui';
import { LoginDemoMutation, LoginMutation, SignUpMutation } from '../graphql/documents';
import { useAuth } from '../lib/auth';
import { errorInfo } from '../lib/errors';
import { haptics } from '../lib/haptics';

export function AuthFormScreen({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [login, runLogin] = useMutation(LoginMutation);
  const [signUp, runSignUp] = useMutation(SignUpMutation);
  const [demo, runDemo] = useMutation(LoginDemoMutation);
  const isLogin = mode === 'login';

  const finish = async (session: Parameters<typeof signIn>[0]) => {
    haptics.success();
    await signIn(session);
  };

  const submit = async () => {
    setFormError(null);
    const parsed = isLogin
      ? loginSchema.safeParse({ email, password })
      : signUpSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      haptics.warning();
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const result = isLogin
      ? await runLogin({ input: { email, password } })
      : await runSignUp({ input: { name, email, password } });
    const session = result.data && ('login' in result.data ? result.data.login : result.data.signUp);
    if (session) return finish(session);
    haptics.error();
    const info = errorInfo(result.error);
    setErrors(info?.fields ?? {});
    setFormError(Object.keys(info?.fields ?? {}).length ? null : (info?.message ?? 'Something went wrong'));
  };

  const tryDemo = async () => {
    const result = await runDemo({});
    if (result.data?.loginDemo) return finish(result.data.loginDemo);
    setFormError(errorInfo(result.error)?.message ?? 'Could not start the demo');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <YStack width="100%" maxW={440} self="center" gap="$5" pt="$6">
          <XStack justify="center">
            <Wordmark />
          </XStack>
          <Card p="$5" gap="$4">
            <YStack gap="$1">
              <Text fontSize={24} fontWeight="800" color="$color12" role="heading">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </Text>
              <Text fontSize={15} color="$color10">
                {isLogin ? 'Log in to see your groups and balances.' : 'Start splitting with friends in seconds.'}
              </Text>
            </YStack>

            {!isLogin ? (
              <Field
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Priya Patel"
                autoComplete="name"
                error={errors.name}
                testID="name-input"
              />
            ) : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              error={errors.email}
              testID="email-input"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={isLogin ? '••••••••' : 'At least 8 characters'}
              secureTextEntry
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              error={errors.password}
              onSubmitEditing={submit}
              testID="password-input"
            />
            {formError ? (
              <Text color="$red10" fontSize={14} role="alert">
                {formError}
              </Text>
            ) : null}
            <Btn size="lg" onPress={submit} loading={login.fetching || signUp.fetching} testID="submit">
              {isLogin ? 'Log in' : 'Create account'}
            </Btn>
            <Btn variant="ghost" onPress={tryDemo} loading={demo.fetching}>
              ✨ Or try the demo instead
            </Btn>
          </Card>

          <XStack justify="center" gap="$1.5">
            <Text color="$color10" fontSize={15}>
              {isLogin ? 'New to SplitEase?' : 'Already have an account?'}
            </Text>
            <Text
              color="$green10"
              fontWeight="700"
              fontSize={15}
              role="link"
              onPress={() => router.replace(isLogin ? '/signup' : '/login')}
            >
              {isLogin ? 'Create an account' : 'Log in'}
            </Text>
          </XStack>
          {isLogin ? (
            <Text text="center" color="$color9" fontSize={13}>
              Demo account: demo@splitease.app / splitease-demo
            </Text>
          ) : null}
        </YStack>
      </Screen>
    </KeyboardAvoidingView>
  );
}
