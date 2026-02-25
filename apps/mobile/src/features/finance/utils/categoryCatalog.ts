import type { Category, CategoryType, TransactionType } from '@mintly/shared';

import type { AppIconName } from '@shared/ui/AppIcon';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface CategoryOption {
  value: string;
  backendId: string;
  label: string;
  iconName: AppIconName;
}

interface SystemCategoryDefinition {
  key: string;
  type: CategoryType;
  translationKey: string;
  fallbackLabel: string;
  iconName: AppIconName;
  aliases: readonly string[];
}

export const VIRTUAL_CATEGORY_PREFIX = 'virtual:';

const SYSTEM_CATEGORY_DEFINITIONS: readonly SystemCategoryDefinition[] = [
  {
    key: 'food',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.food',
    fallbackLabel: 'Food',
    iconName: 'restaurant-outline',
    aliases: ['food', 'yemek', 'gida', 'еда'],
  },
  {
    key: 'market',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.market',
    fallbackLabel: 'Market',
    iconName: 'basket-outline',
    aliases: ['market', 'grocery', 'migros', 'маркет'],
  },
  {
    key: 'transport',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.transport',
    fallbackLabel: 'Transport',
    iconName: 'car-outline',
    aliases: ['transport', 'ulasim', 'ulaşım', 'транспорт'],
  },
  {
    key: 'bills',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.bills',
    fallbackLabel: 'Bills',
    iconName: 'receipt-outline',
    aliases: ['bill', 'bills', 'fatura', 'счет', 'счета'],
  },
  {
    key: 'rent',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.rent',
    fallbackLabel: 'Rent',
    iconName: 'home-outline',
    aliases: ['rent', 'kira', 'аренд'],
  },
  {
    key: 'shopping',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.shopping',
    fallbackLabel: 'Shopping',
    iconName: 'bag-outline',
    aliases: ['shopping', 'alisveris', 'alışveriş', 'покуп'],
  },
  {
    key: 'health',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.health',
    fallbackLabel: 'Health',
    iconName: 'medkit-outline',
    aliases: ['health', 'saglik', 'sağlık', 'здоров'],
  },
  {
    key: 'entertainment',
    type: 'expense',
    translationKey: 'transactions.create.systemCategories.expense.entertainment',
    fallbackLabel: 'Entertainment',
    iconName: 'film-outline',
    aliases: ['entertainment', 'eglence', 'eğlence', 'развлеч'],
  },
  {
    key: 'salary',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.salary',
    fallbackLabel: 'Salary',
    iconName: 'cash-outline',
    aliases: ['salary', 'maas', 'maaş', 'зарплат'],
  },
  {
    key: 'freelance',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.freelance',
    fallbackLabel: 'Freelance',
    iconName: 'briefcase-outline',
    aliases: ['freelance', 'serbest', 'projeli', 'фриланс'],
  },
  {
    key: 'interest',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.interest',
    fallbackLabel: 'Interest',
    iconName: 'trending-up-outline',
    aliases: ['interest', 'faiz', 'процент'],
  },
  {
    key: 'rentIncome',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.rentIncome',
    fallbackLabel: 'Rent Income',
    iconName: 'home-outline',
    aliases: ['rent income', 'kira geliri', 'арендный доход'],
  },
  {
    key: 'investment',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.investment',
    fallbackLabel: 'Investment',
    iconName: 'stats-chart-outline',
    aliases: ['investment', 'yatirim', 'yatırım', 'инвест'],
  },
  {
    key: 'refund',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.refund',
    fallbackLabel: 'Refund',
    iconName: 'refresh-outline',
    aliases: ['refund', 'iade', 'возврат'],
  },
  {
    key: 'gift',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.gift',
    fallbackLabel: 'Gift',
    iconName: 'gift-outline',
    aliases: ['gift', 'hediye', 'подар'],
  },
  {
    key: 'bonus',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.bonus',
    fallbackLabel: 'Bonus',
    iconName: 'trophy-outline',
    aliases: ['bonus', 'prim', 'ikramiye', 'бонус'],
  },
  {
    key: 'otherIncome',
    type: 'income',
    translationKey: 'transactions.create.systemCategories.income.otherIncome',
    fallbackLabel: 'Other Income',
    iconName: 'wallet-outline',
    aliases: ['other income', 'other', 'ek gelir', 'diger gelir', 'другой доход'],
  },
];

export function normalizeCategoryName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9а-яё]+/giu, ' ')
    .trim();
}

export function isGeneralCategoryName(name: string, type: CategoryType): boolean {
  const normalized = normalizeCategoryName(name);
  const hasGeneralMarker = normalized.includes('general') || normalized.includes('genel');
  if (!hasGeneralMarker) {
    return false;
  }

  if (type === 'expense') {
    return normalized.includes('expense') || normalized.includes('gider');
  }

  return normalized.includes('income') || normalized.includes('gelir');
}

function hasUsableTranslation(value: string, key: string): boolean {
  if (!value) {
    return false;
  }

  return value !== key;
}

function localizedSystemLabel(definition: SystemCategoryDefinition, t: Translate): string {
  const translated = t(definition.translationKey);
  if (hasUsableTranslation(translated, definition.translationKey)) {
    return translated;
  }

  return definition.fallbackLabel;
}

function matchSystemDefinition(name: string, type: CategoryType): SystemCategoryDefinition | null {
  const normalized = normalizeCategoryName(name);

  for (const definition of SYSTEM_CATEGORY_DEFINITIONS) {
    if (definition.type !== type) {
      continue;
    }

    if (
      definition.aliases.some((alias) =>
        normalized.includes(normalizeCategoryName(alias)),
      )
    ) {
      return definition;
    }
  }

  return null;
}

function findFallbackCategory(categories: Category[], type: CategoryType): Category | null {
  const typed = categories.filter((category) => category.type === type);

  if (typed.length === 0) {
    return null;
  }

  const general = typed.find((category) => isGeneralCategoryName(category.name, type));
  return general ?? typed[0] ?? null;
}

function inferBackendIcon(category: Category, type: CategoryType): AppIconName {
  if (category.icon) {
    return category.icon as AppIconName;
  }

  const normalized = normalizeCategoryName(category.name);

  if (normalized.includes('food') || normalized.includes('yemek') || normalized.includes('еда')) {
    return 'restaurant-outline';
  }
  if (normalized.includes('market') || normalized.includes('migros')) {
    return 'basket-outline';
  }
  if (normalized.includes('transport') || normalized.includes('ulasim') || normalized.includes('транспорт')) {
    return 'car-outline';
  }
  if (normalized.includes('rent') || normalized.includes('kira') || normalized.includes('аренд')) {
    return 'home-outline';
  }
  if (normalized.includes('bill') || normalized.includes('fatura') || normalized.includes('счет')) {
    return 'receipt-outline';
  }

  return type === 'income' ? 'wallet-outline' : 'ellipse-outline';
}

export function resolveCategoryPresentationByName(
  categoryName: string,
  type: CategoryType,
  t: Translate,
): { label: string; iconName: AppIconName } {
  const definition = matchSystemDefinition(categoryName, type);

  if (definition) {
    return {
      label: localizedSystemLabel(definition, t),
      iconName: definition.iconName,
    };
  }

  if (isGeneralCategoryName(categoryName, type)) {
    return {
      label: type === 'income' ? t('analytics.income') || 'Income' : t('analytics.expense') || 'Expense',
      iconName: type === 'income' ? 'wallet-outline' : 'receipt-outline',
    };
  }

  return {
    label: categoryName,
    iconName: type === 'income' ? 'wallet-outline' : 'ellipse-outline',
  };
}

export function buildSystemCategoryOptions(
  categories: Category[],
  type: TransactionType,
  t: Translate,
): CategoryOption[] {
  const typedCategories = categories.filter((category) => category.type === type);
  const fallbackCategory = findFallbackCategory(typedCategories, type);
  const mappedIds = new Set<string>();
  const options: CategoryOption[] = [];

  for (const definition of SYSTEM_CATEGORY_DEFINITIONS) {
    if (definition.type !== type) {
      continue;
    }

    const matched = typedCategories.find((category) => {
      if (mappedIds.has(category.id)) {
        return false;
      }
      return matchSystemDefinition(category.name, type)?.key === definition.key;
    });

    const backendId = matched?.id ?? fallbackCategory?.id;
    if (!backendId) {
      continue;
    }

    if (matched) {
      mappedIds.add(matched.id);
    }

    options.push({
      value: matched ? matched.id : `${VIRTUAL_CATEGORY_PREFIX}${definition.key}`,
      backendId,
      label: localizedSystemLabel(definition, t),
      iconName: definition.iconName,
    });
  }

  for (const category of typedCategories) {
    if (mappedIds.has(category.id)) {
      continue;
    }

    if (fallbackCategory && category.id === fallbackCategory.id && isGeneralCategoryName(category.name, type)) {
      continue;
    }

    options.push({
      value: category.id,
      backendId: category.id,
      label: resolveCategoryPresentationByName(category.name, type, t).label,
      iconName: inferBackendIcon(category, type),
    });
  }

  return options;
}
