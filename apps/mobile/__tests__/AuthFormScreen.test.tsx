import { fireEvent, screen } from '@testing-library/react-native';
import { Provider } from 'urql';
import { fromValue, never } from 'wonka';

import { AuthFormScreen } from '../src/screens/AuthFormScreen';
import { renderWithProviders } from './test-utils';

const mockSignIn = jest.fn(async () => undefined);
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ status: 'signedOut', userId: null, signIn: mockSignIn, signOut: jest.fn() }),
}));

function clientReturning(result: unknown) {
  return {
    executeMutation: jest.fn(() => fromValue(result)),
    executeQuery: jest.fn(() => never),
    executeSubscription: jest.fn(() => never),
  };
}

async function renderLogin(client: ReturnType<typeof clientReturning>) {
  return renderWithProviders(
    <Provider value={client as never}>
      <AuthFormScreen mode="login" />
    </Provider>,
  );
}

beforeEach(() => mockSignIn.mockClear());

describe('AuthFormScreen', () => {
  it('validates with the shared zod schema before calling the API', async () => {
    const client = clientReturning({});
    await renderLogin(client);
    await fireEvent.changeText(screen.getByTestId('email-input'), 'not-an-email');
    await fireEvent.press(screen.getByTestId('submit'));
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(client.executeMutation).not.toHaveBeenCalled();
  });

  it('signs in with the session returned by the login mutation', async () => {
    const session = {
      accessToken: 'access',
      accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
      refreshToken: 'refresh',
      user: { __typename: 'User', id: 'u1', name: 'Asha' },
    };
    const client = clientReturning({ data: { login: session } });
    await renderLogin(client);
    await fireEvent.changeText(screen.getByTestId('email-input'), 'Asha@Example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'secret-password');
    await fireEvent.press(screen.getByTestId('submit'));
    expect(client.executeMutation).toHaveBeenCalledTimes(1);
    const [operation] = client.executeMutation.mock.calls[0] as unknown as [{ variables: unknown }];
    expect(operation.variables).toEqual({ input: { email: 'Asha@Example.com', password: 'secret-password' } });
    expect(mockSignIn).toHaveBeenCalledWith(session);
  });

  it('shows server-side field errors (wrong password)', async () => {
    const { CombinedError } = jest.requireActual('urql');
    const error = new CombinedError({
      graphQLErrors: [
        {
          message: 'Incorrect email or password',
          extensions: { code: 'BAD_USER_INPUT', fields: { password: 'Incorrect email or password' } },
        },
      ],
    });
    await renderLogin(clientReturning({ error }));
    await fireEvent.changeText(screen.getByTestId('email-input'), 'asha@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'wrong-password');
    await fireEvent.press(screen.getByTestId('submit'));
    expect(await screen.findByText('Incorrect email or password')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
