export const EXPENSE_CATEGORIES = [
  'FOOD',
  'GROCERIES',
  'TRANSPORT',
  'TRAVEL',
  'STAY',
  'RENT',
  'UTILITIES',
  'ENTERTAINMENT',
  'SHOPPING',
  'HEALTH',
  'OTHER',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface CategoryMeta {
  label: string;
  emoji: string;
  /** Accent colour used for chips and the category chart (works on light + dark). */
  color: string;
}

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  FOOD: { label: 'Food & drink', emoji: '🍽️', color: '#F97316' },
  GROCERIES: { label: 'Groceries', emoji: '🛒', color: '#22C55E' },
  TRANSPORT: { label: 'Transport', emoji: '🚕', color: '#EAB308' },
  TRAVEL: { label: 'Travel', emoji: '✈️', color: '#3B82F6' },
  STAY: { label: 'Stay', emoji: '🏨', color: '#8B5CF6' },
  RENT: { label: 'Rent', emoji: '🏠', color: '#0EA5E9' },
  UTILITIES: { label: 'Utilities', emoji: '💡', color: '#14B8A6' },
  ENTERTAINMENT: { label: 'Entertainment', emoji: '🎬', color: '#EC4899' },
  SHOPPING: { label: 'Shopping', emoji: '🛍️', color: '#F43F5E' },
  HEALTH: { label: 'Health', emoji: '💊', color: '#10B981' },
  OTHER: { label: 'Other', emoji: '🧾', color: '#64748B' },
};

export const GROUP_EMOJIS = ['🏖️', '🏠', '🍱', '✈️', '🎉', '🏔️', '🚗', '💼', '🎓', '⚽', '🎮', '❤️'] as const;
