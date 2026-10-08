import { fireEvent, screen } from '@testing-library/react-native';

import { buildParticipants, ExpenseForm } from '../src/screens/ExpenseFormScreen';
import { renderWithProviders } from './test-utils';

const members = [
  { id: 'u-asha', name: 'Asha Rao', avatarColor: '#6366F1' },
  { id: 'u-ben', name: 'Ben Dsouza', avatarColor: '#EC4899' },
  { id: 'u-chen', name: 'Chen Li', avatarColor: '#10B981' },
];

async function setup(onSubmit = jest.fn()) {
  await renderWithProviders(
    <ExpenseForm groupId="g1" currency="INR" members={members} viewerId="u-asha" onSubmit={onSubmit} />,
  );
  return onSubmit;
}

describe('ExpenseForm', () => {
  it('previews an equal split with the remainder paisa assigned deterministically', async () => {
    await setup();
    await fireEvent.changeText(screen.getByTestId('amount-input'), '100');
    expect(await screen.findByTestId('split-status')).toHaveTextContent('Split adds up ✓');
    const shares = members.map((m) => screen.getByTestId(`share-${m.id}`));
    expect(shares.map((s) => s.props.children)).toEqual(['₹33.34', '₹33.33', '₹33.33']);
  });

  it('shows how much is left to assign for exact splits', async () => {
    await setup();
    await fireEvent.changeText(screen.getByTestId('amount-input'), '1000');
    await fireEvent.press(screen.getByTestId('segment-EXACT'));
    await fireEvent.changeText(screen.getByTestId('value-u-asha'), '400');
    await fireEvent.changeText(screen.getByTestId('value-u-ben'), '350');
    expect(await screen.findByTestId('split-status')).toHaveTextContent('₹250.00 left to assign');
    await fireEvent.changeText(screen.getByTestId('value-u-chen'), '250');
    expect(screen.getByTestId('split-status')).toHaveTextContent('Split adds up ✓');
  });

  it('pre-fills percentages that add up to exactly 100%', async () => {
    await setup();
    await fireEvent.changeText(screen.getByTestId('amount-input'), '300');
    await fireEvent.press(screen.getByTestId('segment-PERCENT'));
    expect(screen.getByTestId('value-u-asha').props.value).toBe('33.34');
    expect(screen.getByTestId('value-u-ben').props.value).toBe('33.33');
    expect(await screen.findByTestId('split-status')).toHaveTextContent('Split adds up ✓');
  });

  it('submits integer minor units and the chosen participants', async () => {
    const onSubmit = await setup();
    await fireEvent.changeText(screen.getByTestId('description-input'), 'Groceries');
    await fireEvent.changeText(screen.getByTestId('amount-input'), '1,250.50');
    await fireEvent.press(screen.getByTestId('include-u-chen'));
    await fireEvent.press(screen.getByTestId('category-GROCERIES'));
    await fireEvent.press(screen.getByTestId('save-expense'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0];
    expect(input).toMatchObject({
      description: 'Groceries',
      amount: 125050,
      paidById: 'u-asha',
      category: 'GROCERIES',
      splitMode: 'EQUAL',
      participants: [{ userId: 'u-asha' }, { userId: 'u-ben' }],
    });
    expect(Number.isInteger(input.amount)).toBe(true);
  });

  it('blocks submission and shows field errors for invalid input', async () => {
    const onSubmit = await setup();
    await fireEvent.press(screen.getByTestId('save-expense'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Add a description')).toBeTruthy();
    expect(screen.getByText('Enter an amount')).toBeTruthy();
  });

  it('rejects more decimals than the currency allows', async () => {
    const onSubmit = await setup();
    await fireEvent.changeText(screen.getByTestId('description-input'), 'Chai');
    await fireEvent.changeText(screen.getByTestId('amount-input'), '10.555');
    await fireEvent.press(screen.getByTestId('save-expense'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/valid amount/)).toBeTruthy();
  });
});

describe('buildParticipants', () => {
  const all = new Set(members.map((m) => m.id));
  it('converts per-mode text inputs into minor units, basis points and weights', async () => {
    expect(buildParticipants('EXACT', members, all, { 'u-asha': '10.50' }, 'INR')[0]).toEqual({
      userId: 'u-asha',
      value: 1050,
    });
    expect(buildParticipants('PERCENT', members, all, { 'u-asha': '12.5' }, 'INR')[0]).toEqual({
      userId: 'u-asha',
      value: 1250,
    });
    expect(buildParticipants('SHARES', members, all, { 'u-asha': '2' }, 'INR')[0]).toEqual({
      userId: 'u-asha',
      value: 2,
    });
    expect(buildParticipants('SHARES', members, all, { 'u-asha': '1.5' }, 'INR')[0]).toEqual({
      userId: 'u-asha',
      value: -1,
    });
  });
  it('skips people who are not included', async () => {
    expect(buildParticipants('EQUAL', members, new Set(['u-ben']), {}, 'INR')).toEqual([{ userId: 'u-ben' }]);
  });
});
