import { z } from 'zod';

import { connectMongo, disconnectMongo } from '../src/db/mongo.js';
import { CategoryModel } from '../src/models/Category.js';

if ((process.env.NODE_ENV ?? 'development') !== 'production') {
  await import('dotenv/config');
}

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, 'MONGODB_URI is required')
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must be a valid MongoDB URI'),
});

type CategoryType = 'income' | 'expense';

interface BootstrapCategory {
  key: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
}

const GLOBAL_CATEGORIES: readonly BootstrapCategory[] = [
  { key: 'expense_food', name: 'Food', type: 'expense', color: '#10B981', icon: 'restaurant-outline' },
  { key: 'expense_market', name: 'Market', type: 'expense', color: '#22C55E', icon: 'basket-outline' },
  { key: 'expense_transport', name: 'Transport', type: 'expense', color: '#3B82F6', icon: 'car-outline' },
  { key: 'expense_bills', name: 'Bills', type: 'expense', color: '#6366F1', icon: 'receipt-outline' },
  { key: 'expense_rent', name: 'Rent', type: 'expense', color: '#8B5CF6', icon: 'home-outline' },
  { key: 'expense_shopping', name: 'Shopping', type: 'expense', color: '#EC4899', icon: 'bag-outline' },
  { key: 'expense_health', name: 'Health', type: 'expense', color: '#EF4444', icon: 'medkit-outline' },
  { key: 'expense_entertainment', name: 'Entertainment', type: 'expense', color: '#F59E0B', icon: 'film-outline' },
  { key: 'income_salary', name: 'Salary', type: 'income', color: '#16A34A', icon: 'cash-outline' },
  { key: 'income_other_income', name: 'Other Income', type: 'income', color: '#059669', icon: 'wallet-outline' },
];

async function run(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join(', ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  await connectMongo(parsed.data.MONGODB_URI);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const category of GLOBAL_CATEGORIES) {
    const result = await CategoryModel.updateOne(
      {
        userId: null,
        key: category.key,
        deletedAt: null,
      },
      {
        $set: {
          name: category.name,
          type: category.type,
          color: category.color,
          icon: category.icon,
          isSystem: true,
          deletedAt: null,
        },
        $setOnInsert: {
          userId: null,
          key: category.key,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) {
      insertedCount += 1;
    } else if (result.modifiedCount > 0) {
      updatedCount += 1;
    }
  }

  const total = await CategoryModel.countDocuments({
    userId: null,
    deletedAt: null,
  });

  console.log(
    `[bootstrap] global categories ready (insertedCount=${insertedCount}, updatedCount=${updatedCount}, total=${total})`,
  );
}

run()
  .catch((error) => {
    console.error('[bootstrap] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMongo();
  });
