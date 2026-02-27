import type { SupportedLocale } from '@shared/i18n';
import type { AppIconName } from '@shared/ui/AppIcon';

export type CategoryType = 'income' | 'expense';

export type ExpenseCategoryKey =
  | 'rent'
  | 'bills'
  | 'groceries'
  | 'transport'
  | 'dining'
  | 'shopping'
  | 'health'
  | 'subscriptions'
  | 'education'
  | 'travel'
  | 'debt'
  | 'other_expense';

export type IncomeCategoryKey =
  | 'salary'
  | 'freelance'
  | 'business'
  | 'bonus'
  | 'rental_income'
  | 'investment'
  | 'gifts'
  | 'refund'
  | 'sale'
  | 'other_income';

export type CategoryKey = ExpenseCategoryKey | IncomeCategoryKey;

type CategoryLocale = SupportedLocale;

interface CategoryDefinition<TKey extends CategoryKey> {
  key: TKey;
  type: CategoryType;
  labels: Record<CategoryLocale, string>;
  icon: AppIconName;
}

export interface ListedCategory<TKey extends CategoryKey = CategoryKey> {
  key: TKey;
  label: string;
  icon: AppIconName;
}

const EXPENSE_CATEGORY_DEFINITIONS: readonly CategoryDefinition<ExpenseCategoryKey>[] = [
  {
    key: 'rent',
    type: 'expense',
    labels: { tr: 'Kira', en: 'Rent', ru: 'Аренда' },
    icon: 'home-outline',
  },
  {
    key: 'bills',
    type: 'expense',
    labels: { tr: 'Faturalar', en: 'Bills', ru: 'Счета' },
    icon: 'receipt-outline',
  },
  {
    key: 'groceries',
    type: 'expense',
    labels: { tr: 'Market', en: 'Groceries', ru: 'Продукты' },
    icon: 'basket-outline',
  },
  {
    key: 'transport',
    type: 'expense',
    labels: { tr: 'Ulasim', en: 'Transport', ru: 'Транспорт' },
    icon: 'car-outline',
  },
  {
    key: 'dining',
    type: 'expense',
    labels: { tr: 'Disarida Yeme', en: 'Dining', ru: 'Кафе и рестораны' },
    icon: 'restaurant-outline',
  },
  {
    key: 'shopping',
    type: 'expense',
    labels: { tr: 'Alisveris', en: 'Shopping', ru: 'Покупки' },
    icon: 'bag-outline',
  },
  {
    key: 'health',
    type: 'expense',
    labels: { tr: 'Saglik', en: 'Health', ru: 'Здоровье' },
    icon: 'medkit-outline',
  },
  {
    key: 'subscriptions',
    type: 'expense',
    labels: { tr: 'Abonelikler', en: 'Subscriptions', ru: 'Подписки' },
    icon: 'repeat-outline',
  },
  {
    key: 'education',
    type: 'expense',
    labels: { tr: 'Egitim', en: 'Education', ru: 'Образование' },
    icon: 'school-outline',
  },
  {
    key: 'travel',
    type: 'expense',
    labels: { tr: 'Seyahat', en: 'Travel', ru: 'Путешествия' },
    icon: 'airplane-outline',
  },
  {
    key: 'debt',
    type: 'expense',
    labels: { tr: 'Borc', en: 'Debt', ru: 'Долги' },
    icon: 'card-outline',
  },
  {
    key: 'other_expense',
    type: 'expense',
    labels: { tr: 'Diger Gider', en: 'Other Expense', ru: 'Прочие расходы' },
    icon: 'ellipse-outline',
  },
];

const INCOME_CATEGORY_DEFINITIONS: readonly CategoryDefinition<IncomeCategoryKey>[] = [
  {
    key: 'salary',
    type: 'income',
    labels: { tr: 'Maas', en: 'Salary', ru: 'Зарплата' },
    icon: 'cash-outline',
  },
  {
    key: 'freelance',
    type: 'income',
    labels: { tr: 'Serbest Calisma', en: 'Freelance', ru: 'Фриланс' },
    icon: 'briefcase-outline',
  },
  {
    key: 'business',
    type: 'income',
    labels: { tr: 'Is Geliri', en: 'Business', ru: 'Бизнес' },
    icon: 'business-outline',
  },
  {
    key: 'bonus',
    type: 'income',
    labels: { tr: 'Prim', en: 'Bonus', ru: 'Бонус' },
    icon: 'ribbon-outline',
  },
  {
    key: 'rental_income',
    type: 'income',
    labels: { tr: 'Kira Geliri', en: 'Rental Income', ru: 'Доход от аренды' },
    icon: 'home-outline',
  },
  {
    key: 'investment',
    type: 'income',
    labels: { tr: 'Yatirim', en: 'Investment', ru: 'Инвестиции' },
    icon: 'trending-up-outline',
  },
  {
    key: 'gifts',
    type: 'income',
    labels: { tr: 'Hediyeler', en: 'Gifts', ru: 'Подарки' },
    icon: 'gift-outline',
  },
  {
    key: 'refund',
    type: 'income',
    labels: { tr: 'Iade', en: 'Refund', ru: 'Возврат' },
    icon: 'refresh-outline',
  },
  {
    key: 'sale',
    type: 'income',
    labels: { tr: 'Satis', en: 'Sale', ru: 'Продажа' },
    icon: 'pricetag-outline',
  },
  {
    key: 'other_income',
    type: 'income',
    labels: { tr: 'Diger Gelir', en: 'Other Income', ru: 'Прочие доходы' },
    icon: 'wallet-outline',
  },
];

const CATEGORY_DEFINITIONS: readonly CategoryDefinition<CategoryKey>[] = [
  ...EXPENSE_CATEGORY_DEFINITIONS,
  ...INCOME_CATEGORY_DEFINITIONS,
];

const CATEGORY_BY_KEY = new Map(CATEGORY_DEFINITIONS.map((category) => [category.key, category]));
const EXPENSE_KEYS = new Set<ExpenseCategoryKey>(EXPENSE_CATEGORY_DEFINITIONS.map((category) => category.key));
const INCOME_KEYS = new Set<IncomeCategoryKey>(INCOME_CATEGORY_DEFINITIONS.map((category) => category.key));

function normalizeLocale(locale: string): CategoryLocale {
  if (locale.startsWith('tr')) {
    return 'tr';
  }
  if (locale.startsWith('ru')) {
    return 'ru';
  }
  return 'en';
}

export function isExpenseCategoryKey(value: string): value is ExpenseCategoryKey {
  return EXPENSE_KEYS.has(value as ExpenseCategoryKey);
}

export function isIncomeCategoryKey(value: string): value is IncomeCategoryKey {
  return INCOME_KEYS.has(value as IncomeCategoryKey);
}

export function getCategoryLabel(categoryKey: string, locale: string): string {
  const category = CATEGORY_BY_KEY.get(categoryKey as CategoryKey);
  if (!category) {
    return '';
  }

  const normalizedLocale = normalizeLocale(locale);
  return category.labels[normalizedLocale];
}

export function getCategoryIcon(categoryKey: string): AppIconName {
  return CATEGORY_BY_KEY.get(categoryKey as CategoryKey)?.icon ?? 'ellipse-outline';
}

export function listCategories(type: 'expense', locale: string): ListedCategory<ExpenseCategoryKey>[];
export function listCategories(type: 'income', locale: string): ListedCategory<IncomeCategoryKey>[];
export function listCategories(type: CategoryType, locale: string): ListedCategory[];
export function listCategories(type: CategoryType, locale: string): ListedCategory[] {
  const normalizedLocale = normalizeLocale(locale);
  const categories = type === 'expense' ? EXPENSE_CATEGORY_DEFINITIONS : INCOME_CATEGORY_DEFINITIONS;

  return categories.map((category) => ({
    key: category.key,
    label: category.labels[normalizedLocale],
    icon: category.icon,
  }));
}
