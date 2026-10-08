import { screen } from '@testing-library/react-native';

import { ExpenseRow } from '../src/components/ExpenseRow';
import { describeActivity } from '../src/screens/ActivityScreen';
import { renderWithProviders } from './test-utils';

const base = {
  __typename: 'Expense' as const,
  id: 'e1',
  description: 'Dinner',
  amount: 300000,
  currency: 'INR',
  category: 'FOOD' as const,
  splitMode: 'EQUAL' as const,
  date: '2026-03-14T12:00:00.000Z',
  myShare: 100000,
  paidBy: { __typename: 'User' as const, id: 'me', name: 'Asha Rao', avatarColor: '#000' },
};

describe('ExpenseRow', () => {
  it('shows what the viewer lent when they paid', async () => {
    await renderWithProviders(<ExpenseRow expense={base} viewerId="me" />);
    expect(screen.getByText('you lent')).toBeTruthy();
    expect(screen.getByText('₹2,000.00')).toBeTruthy();
  });

  it('shows what the viewer borrowed when someone else paid', async () => {
    await renderWithProviders(
      <ExpenseRow expense={{ ...base, paidBy: { ...base.paidBy, id: 'other', name: 'Ben Dsouza' } }} viewerId="me" />,
    );
    expect(screen.getByText('you borrowed')).toBeTruthy();
    expect(screen.getByText('₹1,000.00')).toBeTruthy();
    expect(screen.getByText(/Ben paid ₹3,000.00/)).toBeTruthy();
  });

  it('marks expenses the viewer is not part of', async () => {
    await renderWithProviders(
      <ExpenseRow expense={{ ...base, myShare: 0, paidBy: { ...base.paidBy, id: 'other' } }} viewerId="me" />,
    );
    expect(screen.getByText('not involved')).toBeTruthy();
  });
});

describe('describeActivity', () => {
  const activity = {
    __typename: 'Activity' as const,
    id: 'a1',
    type: 'EXPENSE_ADDED' as const,
    summary: 'Cab to airport',
    amount: 165000,
    currency: 'INR',
    createdAt: '2026-03-14T12:00:00.000Z',
    expenseId: 'e1',
    actor: { __typename: 'User' as const, id: 'u2', name: 'Priya Patel', avatarColor: '#000' },
    group: { __typename: 'Group' as const, id: 'g1', name: 'Goa Trip', emoji: '🏖️' },
  };
  it('describes activity from the viewer’s perspective', () => {
    expect(describeActivity(activity, 'me').text).toBe('Priya Patel added “Cab to airport”');
    expect(describeActivity(activity, 'u2').text).toBe('You added “Cab to airport”');
    expect(describeActivity({ ...activity, type: 'MEMBER_JOINED', summary: 'Priya Patel' }, 'me').text).toBe(
      'Priya Patel joined Goa Trip',
    );
  });
});
